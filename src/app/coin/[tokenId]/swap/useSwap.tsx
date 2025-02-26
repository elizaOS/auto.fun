import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { SEED_CONFIG, Serlaunchalot, useProgram } from "@/utils/program";
import { useTradeSettings } from "./useTradeSettings";
import { env } from "@/utils/env";

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
      message: "swapTx",
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
  const tokenSupply = new BN(Number(env.tokenSupply));
  const reserveLamport = new BN(Number(env.virtualReserves));
  const reserveToken = tokenSupply.div(new BN(Number(env.decimals)));

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) {
    console.log("buying", amount, "SOL");
    // Buy
    estimatedOutput = calculateAmountOutBuy(
      reserveLamport.toNumber(),
      adjustedAmount,
      9, // SOL decimals
      reserveToken.toNumber(),
    );
  } else {
    console.log("selling", amount, "tokens");
    // Sell
    estimatedOutput = calculateAmountOutSell(
      reserveLamport.toNumber(),
      adjustedAmount,
      9,
      reserveToken.toNumber(),
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
    .instruction();

  return tx;
};

interface SwapParams {
  style: "buy" | "sell";
  amount: number;
  tokenAddress: string;
}

export const useSwap = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  // TODO: implement speed, front-running protection, and tip amount
  const { slippage: slippagePercentage } = useTradeSettings();

  const createSwapIx = async ({ style, amount, tokenAddress }: SwapParams) => {
    if (!program || !wallet.publicKey) {
      throw new Error("Wallet not connected or missing required methods");
    }

    // Convert percentage to basis points (1% = 100 bps)
    const slippageBps = slippagePercentage * 100;

    // Convert SOL to lamports (1 SOL = 1e9 lamports)
    const amountLamports = Math.floor(amount * 1e9);
    const amountTokens = Math.floor(amount * 1e6);

    // Convert string style to numeric style
    const numericStyle = style === "buy" ? 0 : 1;

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
  };

  const executeSwap = async ({ style, amount, tokenAddress }: SwapParams) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error("Wallet not connected or missing required methods");
    }

    const ix = await createSwapIx({ style, amount, tokenAddress });

    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    console.log("Simulating transaction...");
    const simulation = await connection.simulateTransaction(tx);

    // Print simulation logs
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
