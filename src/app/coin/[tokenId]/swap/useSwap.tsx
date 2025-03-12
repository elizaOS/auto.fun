import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import {
  SEED_BONDING_CURVE,
  SEED_CONFIG,
  Serlaunchalot,
  useProgram,
} from "@/utils/program";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { useTradeSettings } from "./useTradeSettings";
import { Token } from "@/utils/tokens";
import { associatedAddress } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { env } from "@/utils/env";
import { sendTxUsingJito } from "@/utils/jito";

// copied from backend
function convertToBasisPoints(feePercent: number): number {
  if (feePercent >= 1) {
    return feePercent;
  }
  return Math.floor(feePercent * 10000);
}

// copied from backend
export function calculateAmountOutSell(
  reserveLamport: number,
  amount: number,
  tokenDecimals: number,
  platformSellFee: number,
  reserveToken: number,
): number {
  const feeBasisPoints = convertToBasisPoints(platformSellFee);
  const amountBN = new BN(amount);

  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
    .mul(new BN(10000 - feeBasisPoints))
    .div(new BN(10000));

  // For selling tokens: amount_out = reserve_lamport * adjusted_amount / (reserve_token + adjusted_amount)
  const numerator = new BN(reserveLamport).mul(adjustedAmount);
  const denominator = new BN(reserveToken).add(adjustedAmount);

  return numerator.div(denominator).toNumber();
}

// copied from backend
function calculateAmountOutBuy(
  reserveToken: number,
  amount: number,
  solDecimals: number,
  reserveLamport: number,
  platformBuyFee: number,
): number {
  const feeBasisPoints = convertToBasisPoints(platformBuyFee);
  const amountBN = new BN(amount);

  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
    .mul(new BN(10000 - feeBasisPoints))
    .div(new BN(10000));

  const numerator = new BN(reserveToken).mul(adjustedAmount);
  const denominator = new BN(reserveLamport).add(adjustedAmount);

  return numerator.div(denominator).toNumber();
}

const FEE_BASIS_POINTS = 10000;

const swapIx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  program: Program<Serlaunchalot>,
  reserveToken: number,
  reserveLamport: number,
) => {
  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId,
  );
  const configAccount = await program.account.config.fetch(configPda);

  // Apply platform fee
  const feePercent =
    style === 1
      ? Number(configAccount.platformSellFee)
      : Number(configAccount.platformBuyFee);
  const adjustedAmount = Math.floor(
    (amount * (FEE_BASIS_POINTS - feePercent)) / FEE_BASIS_POINTS,
  );

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) {
    // Buy
    estimatedOutput = calculateAmountOutBuy(
      reserveToken,
      adjustedAmount,
      9, // SOL decimals
      reserveLamport,
      feePercent,
    );
  } else {
    // Sell
    estimatedOutput = calculateAmountOutSell(
      reserveLamport,
      adjustedAmount,
      6,
      feePercent,
      reserveToken,
    );
  }

  // Apply slippage to estimated output
  const minOutput = new BN(
    Math.floor((estimatedOutput * (10000 - slippageBps)) / 10000),
  );

  const deadline = Math.floor(Date.now() / 1000) + 120;

  // Apply the fee instruction to the transaction
  const tx = await program.methods
    .swap(new BN(amount), style, minOutput, new BN(deadline))
    .accounts({
      teamWallet: configAccount.teamWallet,
      user,
      tokenMint: token,
    })
    .instruction();

  return tx;
};

/**
 * Implements swapping via the Jupiter API.
 *
 * For buys, we swap SOL for a token.
 * For sells, we swap the token for SOL.
 *
 */
export const getJupiterSwapIx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number, // 0 for buy; 1 for sell
  slippageBps: number = 100,
  connection: Connection,
) => {
  // Jupiter uses the following constant to represent SOL
  const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

  // @TODO token address is static for now because our project is not deployed to mainnet yet
  const tokenMintAddress = "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump";
  const inputMint = style === 0 ? SOL_MINT_ADDRESS : tokenMintAddress;
  const outputMint = style === 0 ? tokenMintAddress : SOL_MINT_ADDRESS;

  // 1. Get a quote from Jupiter.
  const feePercent = 0.2;
  const feeBps = feePercent * 100;
  // Add platform fee to the quote
  const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true&platformFeeBps=${feeBps}`;
  const quoteRes = await fetch(quoteUrl);

  if (!quoteRes.ok) {
    const errorMsg = await quoteRes.text();
    throw new Error(`Failed to fetch quote from Jupiter: ${errorMsg}`);
  }
  const quoteResponse = await quoteRes.json();

  // 2. Build the swap transaction by POSTing to Jupiter's swap endpoint.
  const feeAccount = associatedAddress({
    mint: new PublicKey(tokenMintAddress),
    owner: new PublicKey(env.devAddress),
  });

  const feeAccountData = await connection.getAccountInfo(feeAccount);

  const additionalIxs = [];
  if (!feeAccountData) {
    // Create the fee account
    const createFeeAccountIx = createAssociatedTokenAccountInstruction(
      user,
      feeAccount,
      new PublicKey(env.devAddress),
      new PublicKey(tokenMintAddress),
    );
    additionalIxs.push(createFeeAccountIx);
  }

  const swapUrl = "https://api.jup.ag/swap/v1/swap";
  const body = {
    quoteResponse,
    userPublicKey: user.toBase58(),
    asLegacyTransaction: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    feeAccount: feeAccount.toBase58(),
  };
  const swapRes = await fetch(swapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!swapRes.ok) {
    const errorMsg = await swapRes.text();
    throw new Error(`Failed to build Jupiter swap transaction: ${errorMsg}`);
  }
  const swapJson = await swapRes.json();

  if (!swapJson.swapTransaction) {
    throw new Error("Jupiter swap transaction is missing in the response.");
  }

  const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
  const swapTransaction = Transaction.from(txBuffer);

  return [...additionalIxs, ...swapTransaction.instructions];
};

interface SwapParams {
  style: "buy" | "sell";
  amount: number;
  tokenAddress: string;
  token?: Token;
  reserveToken: number;
  reserveLamport: number;
}

export const useSwap = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  // TODO: implement speed, front-running protection, and tip amount
  const {
    slippage: slippagePercentage,
    speed,
    isProtectionEnabled,
    // tipAmount, @TODO use on jito
  } = useTradeSettings();

  const createSwapIx = async ({
    style,
    amount,
    tokenAddress,
    token,
    reserveToken,
    reserveLamport,
  }: SwapParams) => {
    if (!program || !wallet.publicKey) {
      throw new Error("Wallet not connected or missing required methods");
    }

    // Convert percentage to basis points (1% = 100 bps)
    const slippageBps = slippagePercentage * 100;

    // Convert SOL to lamports (1 SOL = 1e9 lamports)
    const amountLamports = Math.floor(amount * 1e9);
    const amountTokens = Math.floor(amount * 1e6);

    // Convert string style ("buy" or "sell") to numeric style (0 for buy; 1 for sell)
    const numericStyle = style === "buy" ? 0 : 1;

    const ixs = [];
    if (token?.status === "locked") {
      const mainnetConnection = new Connection(
        "https://mainnet.helius-rpc.com/?api-key=156e83be-b359-4f60-8abb-c6a17fd3ff5f",
      );
      // Use Jupiter API when tokens are locked
      const ixsJupiterSwap = await getJupiterSwapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        mainnetConnection,
      );

      ixs.push(...ixsJupiterSwap);
    } else {
      // Use the internal swap function otherwise
      const ix = await swapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        program,
        reserveToken,
        reserveLamport,
      );

      ixs.push(ix);
    }

    // Define SOL fee amounts based on speed
    let solFee;
    switch (speed) {
      case "fast":
        solFee = 0.00005;
        break;
      case "turbo":
        solFee = 0.0005;
        break;
      case "ultra":
        solFee = 0.005;
        break;
      default:
        solFee = 0.00005;
    }
    // Convert SOL fee to lamports (1 SOL = 1e9 lamports)
    const feeLamports = Math.floor(solFee * 1e9);

    // Create a transaction instruction to apply the fee
    const feeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: feeLamports,
    });

    ixs.push(feeInstruction);

    return ixs;
  };

  const executeSwap = async ({
    style,
    amount,
    tokenAddress,
    token,
  }: Omit<SwapParams, "reserveToken" | "reserveLamport">) => {
    if (!wallet.publicKey || !wallet.signTransaction || !program) {
      throw new Error("Wallet not connected or missing required methods");
    }

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), new PublicKey(tokenAddress).toBytes()],
      program.programId,
    );
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda);

    const ixs = await createSwapIx({
      style,
      amount,
      tokenAddress,
      reserveLamport: curve.reserveLamport,
      reserveToken: curve.reserveToken,
      token,
    });

    const tx = new Transaction().add(...(Array.isArray(ixs) ? ixs : [ixs]));
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    console.log("Simulating transaction...");
    const simulation = await connection.simulateTransaction(tx);
    console.log("Simulation logs:", simulation.value.logs);
    if (simulation.value.err) {
      console.error("Simulation failed:", simulation.value.err.toString());
      throw new Error(`Transaction simulation failed: ${simulation.value.err}`);
    }

    const versionedTx = new VersionedTransaction(tx.compileMessage());

    // If protection is enabled, use Jito to send the transaction
    if (isProtectionEnabled) {
      console.log("Sending transaction through Jito for MEV protection...");
      try {
        const jitoResponse = await sendTxUsingJito({
          serializedTx: versionedTx.serialize(),
          region: "mainnet",
        });
        return { signature: jitoResponse.result, confirmation: null };
      } catch (error) {
        console.error("Failed to send through Jito:", error);
        // Fallback to regular transaction sending if Jito fails
        const signature = await wallet.sendTransaction(versionedTx, connection);
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: versionedTx.message.recentBlockhash,
          lastValidBlockHeight,
        });
        return { signature, confirmation };
      }
    }

    // Regular transaction sending if protection is not enabled
    const signature = await wallet.sendTransaction(versionedTx, connection);
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: versionedTx.message.recentBlockhash,
      lastValidBlockHeight,
    });
    return { signature, confirmation };
  };

  const initialBuyIx = async (
    params: Omit<SwapParams, "reserveToken" | "reserveLamport">,
  ) => {
    /**
     * we avoid fetching from the curve here for initial buy since
     * the curve does not exist yet at time of transaction creation.
     * so we use env vars instead, since we know they will always initially be the same.
     */
    return createSwapIx({
      ...params,
      reserveLamport: new BN(env.tokenSupply).div(new BN(env.decimals)),
      reserveToken: new BN(env.virtualReserves),
    });
  };

  return { createSwapIx: initialBuyIx, executeSwap };
};
