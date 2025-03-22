
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
} from "@solana/web3.js";
import BN from "bn.js";

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const getAssociatedTokenAccount = (
  ownerPubkey: PublicKey,
  mintPk: PublicKey
): PublicKey => {
  const associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync(
    [
      ownerPubkey.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      mintPk.toBytes(), // mint address
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  ))[0];

  return associatedTokenAccountPubkey;
}

export function convertToBasisPoints(feePercent: number): number {
  if (feePercent >= 1) {
    return feePercent;
  } 
  return Math.floor(feePercent * 10000);
}

export function calculateAmountOutSell(
  reserveLamport: number,
  amount: number,
  platformSellFee: number,
  reserveToken: number
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

export function calculateAmountOutBuy(
reserveToken: number,
amount: number,
reserveLamport: number,
platformBuyFee: number
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
