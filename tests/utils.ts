
import {
  PublicKey,
} from "@solana/web3.js";
import BN from "bn.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const getAssociatedTokenAccount = (
  ownerPubkey: PublicKey,
  mintPk: PublicKey
): PublicKey => {
  let associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync(
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
  return Math.floor(feePercent * 10000);
}

export function calculateAmountOutSell(
reserveLamport: number,
amount: number,
tokenDecimals: number,
platformSellFee: number
): number {
  const feeBasisPoints = convertToBasisPoints(platformSellFee);
  const amountBN = new BN(amount);
  
  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
      .mul(new BN(10000 - feeBasisPoints))
      .div(new BN(10000));

  const numerator = new BN(reserveLamport).mul(adjustedAmount);
  const denominator = new BN(reserveLamport).add(adjustedAmount);
  
  return numerator.div(denominator).toNumber();
}

export function calculateAmountOutBuy(
reserveToken: number,
amount: number,
solDecimals: number,
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
