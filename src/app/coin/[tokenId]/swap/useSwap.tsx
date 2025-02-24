import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import {
  SEED_CONFIG,
  Serlaunchalot,
  SEED_BONDING_CURVE,
  useProgram,
} from "@/utils/program";
import { useTradeSettings } from "./useTradeSettings";
import { Token } from "@/utils/tokens";

function convertToFloat(value: number, decimals: number): number {
  return value / Math.pow(10, decimals);
}

function convertFromFloat(value: number, decimals: number): number {
  return value * Math.pow(10, decimals);
}

function calculateAmountOutBuy(
  reserveLamport: number,
  adjustedAmount: number,
  solDecimals: number, // renamed for clarity
  reserveToken: number,
): number {
  // Calculate the denominator sum which is (y + dy)
  const denominatorSum = reserveLamport + adjustedAmount;

  // Convert to float for division
  const denominatorSumFloat = convertToFloat(denominatorSum, solDecimals);
  const adjustedAmountFloat = convertToFloat(adjustedAmount, solDecimals);

  // (y + dy) / dy
  const divAmt = denominatorSumFloat / adjustedAmountFloat;

  // Convert reserveToken to float with 6 decimals (token decimals)
  const reserveTokenFloat = convertToFloat(reserveToken, 6);

  // Calculate dx = xdy / (y + dy)
  const amountOutInFloat = reserveTokenFloat / divAmt;

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 6);

  return Math.floor(amountOut); // Added Math.floor for safety
}

function calculateAmountOutSell(
  reserveLamport: number,
  adjustedAmount: number,
  tokenOneDecimals: number,
  reserveToken: number,
): number {
  // Calculate the denominator sum which is (x + dx)
  const denominatorSum = reserveToken + adjustedAmount;

  // Convert to float for division
  const denominatorSumFloat = convertToFloat(denominatorSum, tokenOneDecimals);
  const adjustedAmountFloat = convertToFloat(adjustedAmount, tokenOneDecimals);

  // (x + dx) / dx
  const divAmt = denominatorSumFloat / adjustedAmountFloat;

  // Convert reserveLamport to float with 9 decimals
  const reserveLamportFloat = convertToFloat(reserveLamport, 9);

  // Calculate dy = y / ((x + dx) / dx)
  const amountOutInFloat = reserveLamportFloat / divAmt;

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 9);

  return Math.floor(amountOut);
}

export const getAutofunSwapTx = async (
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
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_BONDING_CURVE), token.toBytes()],
    program.programId,
  );
  const curve = await program.account.bondingCurve.fetch(bondingCurvePda);

  // Apply platform fee
  const feePercent =
    style === 1 ? configAccount.platformSellFee : configAccount.platformBuyFee;
  const adjustedAmount = Math.floor((amount * (100 - feePercent)) / 100);

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) {
    console.log("buying", amount, "SOL");
    // Buy
    estimatedOutput = calculateAmountOutBuy(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      9, // SOL decimals
      curve.reserveToken.toNumber(),
    );
  } else {
    console.log("selling", amount, "tokens");
    // Sell
    estimatedOutput = calculateAmountOutSell(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      9,
      curve.reserveToken.toNumber(),
    );

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
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};

/**
 * Implements swapping via the Jupiter API.
 *
 * For buys, we swap SOL for a token.
 * For sells, we swap the token for SOL.
 *
 * We first generate a quote (using GET) and then POST the quote
 * to build a swap transaction. By setting asLegacyTransaction: true,
 * we receive a legacy Transaction, which can be simulated and submitted
 * in the same manner as our alternate getAutofunSwapTx.
 */
export const getJupiterSwapTx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number, // 0 for buy; 1 for sell
  slippageBps: number = 100,
  connection: Connection,
): Promise<Transaction> => {
  // Jupiter uses the following constant to represent SOL
  const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

  const tokenMintAddress = "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump";
  // When buying, spending SOL to get the target token, and vice versa for selling.
  const inputMint = style === 0 ? SOL_MINT_ADDRESS : tokenMintAddress;
  const outputMint = style === 0 ? tokenMintAddress : SOL_MINT_ADDRESS;

  // 1. Get a quote from Jupiter.
  const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    const errorMsg = await quoteRes.text();
    throw new Error(`Failed to fetch quote from Jupiter: ${errorMsg}`);
  }
  const quoteResponse = await quoteRes.json();
  console.log("Jupiter quote response:", quoteResponse);

  // 2. Build the swap transaction by POSTing to Jupiter's swap endpoint.
  const swapUrl = "https://api.jup.ag/swap/v1/swap";
  const body = {
    quoteResponse,
    userPublicKey: user.toBase58(),
    // Request a legacy transaction so that it can be simulated/used with our UI flow.
    asLegacyTransaction: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    // You can also add prioritizationFeeLamports if desired:
    // prioritizationFeeLamports: {
    //   priorityLevelWithMaxLamports: {
    //     maxLamports: 1000000,
    //     priorityLevel: "veryHigh"
    //   }
    // }
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
  console.log("Jupiter swap response:", swapJson);

  if (swapJson.simulationError) {
    console.error("Simulation error:", swapJson.simulationError.error);
    throw new Error(`Simulation failed: ${swapJson.simulationError.error}`);
  }

  if (!swapJson.swapTransaction) {
    throw new Error("Jupiter swap transaction is missing in the response.");
  }

  // 3. Deserialize the swap transaction from base64.
  // When asLegacyTransaction is true, the endpoint returns a base64-encoded legacy Transaction.
  const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
  const transaction = Transaction.from(txBuffer);

  // 4. Override fee payer & refresh blockhash to be safe.
  transaction.feePayer = user;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  return transaction;
};

interface SwapParams {
  style: "buy" | "sell";
  amount: number;
  tokenAddress: string;
  token: Token;
}

export const useSwap = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  // TODO: implement speed, front-running protection, and tip amount
  const { slippage: slippagePercentage } = useTradeSettings();

  const handleSwap = async ({
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

    let tx: Transaction | undefined;
    if (token.status === "locked") {
      const mainnetConnection = new Connection(
        "https://mainnet.helius-rpc.com/?api-key=156e83be-b359-4f60-8abb-c6a17fd3ff5f",
      );
      // Use Jupiter API when tokens are locked
      tx = await getJupiterSwapTx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        mainnetConnection,
      );

      console.log("Simulating transaction...");
      const simulation = await mainnetConnection.simulateTransaction(tx);
      console.log("Simulation logs:", simulation.value.logs);
      if (simulation.value.err) {
        console.error("Simulation failed:", simulation.value.err.toString());
        throw new Error(
          `Transaction simulation failed: ${simulation.value.err}`,
        );
      }

      const { blockhash, lastValidBlockHeight } =
        await mainnetConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // Convert to a versioned transaction to be sent
      const versionedTx = new VersionedTransaction(tx.compileMessage());
      const signature = await wallet.sendTransaction(
        versionedTx,
        mainnetConnection,
      );
      const confirmation = await mainnetConnection.confirmTransaction({
        signature,
        blockhash: versionedTx.message.recentBlockhash,
        lastValidBlockHeight,
      });

      return { signature, confirmation };
    } else {
      // Use the internal swap function otherwise
      tx = await getAutofunSwapTx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        connection,
        program,
      );
    }

    console.log("Simulating transaction...");
    const simulation = await connection.simulateTransaction(tx);
    console.log("Simulation logs:", simulation.value.logs);
    if (simulation.value.err) {
      console.error("Simulation failed:", simulation.value.err.toString());
      throw new Error(`Transaction simulation failed: ${simulation.value.err}`);
    }

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Convert to a versioned transaction to be sent
    const versionedTx = new VersionedTransaction(tx.compileMessage());
    const signature = await wallet.sendTransaction(versionedTx, connection);
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: versionedTx.message.recentBlockhash,
      lastValidBlockHeight,
    });

    return { signature, confirmation };
  };

  return { handleSwap };
};
