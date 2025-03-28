import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { Autofun } from "./program";
import { BN, Program } from "@coral-xyz/anchor";

/**
 * Converts a decimal fee (e.g., 0.05 for 5%) to basis points (5% = 500 basis points)
 */
function convertToBasisPoints(fee: number): number {
  return Math.floor(fee * 10000);
}

/**
 * Calculates the amount of SOL received when selling tokens
 */
export function calculateAmountOutSell(
  reserveLamport: number,
  amount: number,
  _tokenDecimals: number,
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

export const launchAndSwapTx = async (
  creator: PublicKey,
  decimals: number,
  tokenSupply: number,
  virtualLamportReserves: number,
  name: string,
  symbol: string,
  uri: string,
  swapAmount: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Autofun>,
  mintKeypair: Keypair,
  configAccount: {
    teamWallet: PublicKey;
    initBondingCurve: number;
  }
) => {
  // Calculate deadline
  const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

  // Calculate minimum receive amount based on bonding curve formula
  // This is an estimate and should be calculated more precisely based on the bonding curve
  const initBondingCurvePercentage = configAccount.initBondingCurve;
  const initBondingCurveAmount =
    (tokenSupply * initBondingCurvePercentage) / 100;

  // Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
  // where x = reserveToken, y = reserveLamport, dx = swapAmount
  const numerator = virtualLamportReserves * swapAmount;
  const denominator = initBondingCurveAmount + swapAmount;
  const expectedOutput = Math.floor(numerator / denominator);

  // Apply slippage to expected output
  const minOutput = Math.floor(
    (expectedOutput * (10000 - slippageBps)) / 10000
  );

  const tx = await program.methods
    .launchAndSwap(
      decimals,
      new BN(tokenSupply),
      new BN(virtualLamportReserves),
      name,
      symbol,
      uri,
      new BN(swapAmount),
      new BN(minOutput),
      new BN(deadline)
    )
    .accounts({
      teamWallet: configAccount.teamWallet,
      creator: creator,
      token: mintKeypair.publicKey,
    })
    .transaction();

  tx.feePayer = creator;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};

