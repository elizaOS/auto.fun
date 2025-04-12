import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { Autofun } from "@/utils/program";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { associatedAddress } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { env } from "@/utils/env";
import { ConfigAccount } from "@/types";
import { getConfigAccount } from "@/hooks/use-config-account";

/**
 * Converts a decimal fee (e.g., 0.05 for 5%) to basis points (5% = 500 basis points)
 */
function convertToBasisPoints(feePercent: number): number {
  if (feePercent >= 1) {
    return feePercent;
  }
  return Math.floor(feePercent * 10000);
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
  const numerator = new BN(reserveLamport.toString()).mul(adjustedAmount);
  const denominator = new BN(reserveToken.toString()).add(adjustedAmount);

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
  },
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
    (expectedOutput * (10000 - slippageBps)) / 10000,
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
      new BN(deadline),
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
function calculateAmountOutBuy(
  reserveToken: number,
  amount: number,
  _solDecimals: number,
  reserveLamport: number,
  platformBuyFee: number,
): number {
  const feeBasisPoints = convertToBasisPoints(platformBuyFee);
  const amountBN = new BN(amount);

  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
    .mul(new BN(10000 - feeBasisPoints))
    .div(new BN(10000));

  const numerator = new BN(reserveToken.toString()).mul(adjustedAmount);
  const denominator = new BN(reserveLamport.toString()).add(adjustedAmount);

  return numerator.div(denominator).toNumber();
}

const FEE_BASIS_POINTS = 10000;

export const getSwapAmount = async (
  program: Program<Autofun>,
  amount: number,
  style: number,
  reserveToken: number,
  reserveLamport: number,
) => {
  console.log(
    "swap amount input:",
    amount,
    style,
    reserveToken,
    reserveLamport,
  );

  const configAccount = await getConfigAccount(program);

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

    console.log("estimated out:", estimatedOutput);
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

  console.log("swap amount:", estimatedOutput);

  return estimatedOutput;
};

export const swapIx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  program: Program<Autofun>,
  reserveToken: number,
  reserveLamport: number,
  configAccount: ConfigAccount,
) => {
  const estimatedOutput = await getSwapAmount(
    program,
    amount,
    style,
    reserveToken,
    reserveLamport,
  );

  // Apply slippage to estimated output
  const minOutput = new BN(
    Math.floor((estimatedOutput * (10000 - slippageBps)) / 10000),
  );

  const deadline = Math.floor(Date.now() / 1000) + 120;

  console.log("program swap:", {
    amount,
    style,
    minOutput,
    deadline,
  });

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
  _token: PublicKey,
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
  const swapJson = (await swapRes.json()) as any;

  if (!swapJson.swapTransaction) {
    throw new Error("Jupiter swap transaction is missing in the response.");
  }

  const txBuffer = Buffer.from(swapJson.swapTransaction, "base64");
  const swapTransaction = Transaction.from(txBuffer);

  return [...additionalIxs, ...swapTransaction.instructions];
};
