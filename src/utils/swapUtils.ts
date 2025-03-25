import { BN } from "@coral-xyz/anchor";

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