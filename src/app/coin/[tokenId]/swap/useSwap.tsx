import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  SEED_CONFIG,
  IDL,
  Serlaunchalot,
  SEED_BONDING_CURVE,
} from "./programTypes";

export function convertToFloat(value: number, decimals: number): number {
  return value / Math.pow(10, decimals);
}

export function convertFromFloat(value: number, decimals: number): number {
  return value * Math.pow(10, decimals);
}

export function calculateAmountOutBuy(
  reserveLamport: number,
  adjustedAmount: number,
  tokenOneDecimals: number,
  reserveToken: number,
): number {
  // Calculate the denominator sum which is (y + dy)
  const denominatorSum = reserveLamport + adjustedAmount;

  // Convert to float for division
  const denominatorSumFloat = convertToFloat(denominatorSum, tokenOneDecimals);
  const adjustedAmountFloat = convertToFloat(adjustedAmount, tokenOneDecimals);

  // (y + dy) / dy
  const divAmt = denominatorSumFloat / adjustedAmountFloat;

  // Convert reserveToken to float with 9 decimals
  const reserveTokenFloat = convertToFloat(reserveToken, 9);

  // Calculate dx = xdy / (y + dy)
  const amountOutInFloat = reserveTokenFloat / divAmt;

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 9);

  return amountOut;
}

export function calculateAmountOutSell(
  reserveLamport: number,
  adjustedAmount: number,
  tokenOneDecimals: number,
  reserveToken: number,
): number {
  // Calculate the denominator difference which is (x - dx)
  const denominatorDiff = reserveToken - adjustedAmount;

  // Convert to float for division
  const denominatorDiffFloat = convertToFloat(
    denominatorDiff,
    tokenOneDecimals,
  );
  const reserveTokenFloat = convertToFloat(reserveToken, tokenOneDecimals);

  // (x - dx) / x
  const divAmt = denominatorDiffFloat / reserveTokenFloat;

  // Convert reserveLamport to float with 9 decimals
  const reserveLamportFloat = convertToFloat(reserveLamport, 9);

  // Calculate dy = y - (xy/(x - dx))
  const amountOutInFloat = reserveLamportFloat * (1 - divAmt);

  // Convert the result back to the original decimal format
  const amountOut = convertFromFloat(amountOutInFloat, 9);

  return Math.floor(amountOut); // Round down for safety
}

export const swapTx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Serlaunchalot>,
) => {
  const [configPda] = PublicKey.findProgramAddressSync(
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
  const adjustedAmount = (amount * (100 - feePercent)) / 100;

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) {
    // Buy
    estimatedOutput = calculateAmountOutBuy(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      9, // SOL decimals
      curve.reserveToken.toNumber(),
    );
  } else {
    // Sell
    estimatedOutput = calculateAmountOutSell(
      curve.reserveToken.toNumber(),
      adjustedAmount,
      6, // SOL decimals
      curve.reserveLamport.toNumber(),
    );
  }

  // Apply slippage to estimated output
  const minOutput = new BN(
    Math.floor((estimatedOutput * (10000 - slippageBps)) / 10000),
  );

  const deadline = Math.floor(Date.now() / 1000) + 120;

  // Create a transaction object
  const tx = await program.methods
    .swap(new BN(amount), style, minOutput, new BN(deadline))
    .accounts({
      teamWallet: configAccount.teamWallet,
      user,
      tokenMint: token,
    })
    .transaction();

  tx.feePayer = user;

  return tx;
};

interface SwapParams {
  slippagePercentage: number;
  style: "buy" | "sell";
  amountSol: number;
  tokenAddress: string;
}

export const useSwap = () => {
  const { connection } = useConnection();
  const wallet = useWallet();

  const handleSwap = async ({
    slippagePercentage,
    style,
    amountSol,
    tokenAddress,
  }: SwapParams) => {
    if (
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      throw new Error("Wallet not connected or missing required methods");
    }

    // Convert percentage to basis points (1% = 100 bps)
    const slippageBps = slippagePercentage * 100;

    // Convert SOL to lamports (1 SOL = 1e9 lamports)
    const amountLamports = Math.floor(amountSol * 1e9);

    // Convert string style to numeric style
    const numericStyle = style === "buy" ? 0 : 1;

    const provider = new AnchorProvider(
      connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
      AnchorProvider.defaultOptions(),
    );

    const program = new Program(IDL as Serlaunchalot, provider);

    const tx = await swapTx(
      wallet.publicKey,
      new PublicKey(tokenAddress),
      amountLamports,
      numericStyle,
      slippageBps,
      connection,
      program,
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

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
