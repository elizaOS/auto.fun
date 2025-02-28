import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { SEED_CONFIG, Serlaunchalot, useProgram } from "@/utils/program";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { useTradeSettings } from "./useTradeSettings";
import { Token } from "@/utils/tokens";
import { associatedAddress } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { env } from "@/utils/env";

function convertToFloat(value: number, decimals: number): number {
  return value / Math.pow(10, decimals);
}

function convertFromFloat(value: number, decimals: number): number {
  return value * Math.pow(10, decimals);
}

const tokenSupply = new BN(Number(env.tokenSupply));
const reserveLamport = new BN(Number(env.virtualReserves));
const reserveToken = tokenSupply.div(new BN(Number(env.decimals)));

export function calculateAmountOutBuy(adjustedAmount: number): number {
  const solDecimals = 9;
  // Calculate the denominator sum which is (y + dy)
  const denominatorSum = reserveLamport.toNumber() + adjustedAmount;

  // Convert to float for division
  const denominatorSumFloat = convertToFloat(denominatorSum, solDecimals);
  const adjustedAmountFloat = convertToFloat(adjustedAmount, solDecimals);

  // (y + dy) / dy
  const divAmt = denominatorSumFloat / adjustedAmountFloat;

  // Convert reserveToken to float with 6 decimals (token decimals)
  const reserveTokenFloat = convertToFloat(reserveToken.toNumber(), 6);

  // Calculate dx = xdy / (y + dy)
  const amountOutInFloat = reserveTokenFloat / divAmt;

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 6);

  return Math.floor(amountOut); // Added Math.floor for safety
}

export function calculateAmountOutSell(adjustedAmount: number): number {
  const tokenOneDecimals = 9;
  // Calculate the denominator sum which is (x + dx)
  const denominatorSum = reserveToken.toNumber() + adjustedAmount;

  // Convert to float for division
  const denominatorSumFloat = convertToFloat(denominatorSum, tokenOneDecimals);
  const adjustedAmountFloat = convertToFloat(adjustedAmount, tokenOneDecimals);

  // (x + dx) / dx
  const divAmt = denominatorSumFloat / adjustedAmountFloat;

  // Convert reserveLamport to float with 9 decimals
  const reserveLamportFloat = convertToFloat(reserveLamport.toNumber(), 9);

  // Calculate dy = y / ((x + dx) / dx)
  const amountOutInFloat = reserveLamportFloat / divAmt;

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 9);

  return Math.floor(amountOut);
}

const swapIx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Serlaunchalot>,
) => {
  console.log(
    JSON.stringify({
      message: "getAutofunSwapTx",
      amount,
      style,
      slippageBps,
      user: user.toString(),
      token: token.toString(),
    }),
  );

  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId,
  );
  const configAccount = await program.account.config.fetch(configPda);

  // Apply platform fee
  const feePercent =
    style === 1 ? configAccount.platformSellFee : configAccount.platformBuyFee;
  const adjustedAmount = Math.floor((amount * (100 - feePercent)) / 100);

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) {
    console.log("buying", amount, "SOL");
    // Buy
    estimatedOutput = calculateAmountOutBuy(adjustedAmount);
  } else {
    console.log("selling", amount, "tokens");
    // Sell
    estimatedOutput = calculateAmountOutSell(adjustedAmount);

    console.log("Estimated output:", estimatedOutput);
  }

  // Apply slippage to estimated output
  const minOutput = new BN(
    Math.floor((estimatedOutput * (10000 - slippageBps)) / 10000),
  );

  const deadline = Math.floor(Date.now() / 1000) + 120;

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
}

export const useSwap = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  // TODO: implement speed, front-running protection, and tip amount
  const { slippage: slippagePercentage } = useTradeSettings();

  const createSwapIx = async ({
    style,
    amount,
    tokenAddress,
    token,
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

    if (token?.status === "locked") {
      const mainnetConnection = new Connection(
        "https://mainnet.helius-rpc.com/?api-key=156e83be-b359-4f60-8abb-c6a17fd3ff5f",
      );
      // Use Jupiter API when tokens are locked
      const ix = await getJupiterSwapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        mainnetConnection,
      );

      return ix;
    } else {
      // Use the internal swap function otherwise
      const ix = await swapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        connection,
        program,
      );
      return ix;
    }
  };

  const executeSwap = async ({
    style,
    amount,
    tokenAddress,
    token,
  }: SwapParams) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error("Wallet not connected or missing required methods");
    }

    const ix = await createSwapIx({ style, amount, tokenAddress, token });

    const tx = new Transaction().add(...(Array.isArray(ix) ? ix : [ix]));
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
    const signature = await wallet.sendTransaction(versionedTx, connection);
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: versionedTx.message.recentBlockhash,
      lastValidBlockHeight,
    });
    return { signature, confirmation };
  };

  return { createSwapIx, executeSwap };
};
