import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Env } from "./env";
import { logger } from "./logger";
import { getDB } from "./db";
import { swaps, tokens } from "./db";
import { eq } from "drizzle-orm";
import { getRpcUrl } from "./util";

// Interface for swap operations
export interface SwapParams {
  tokenMint: string;
  direction: "buy" | "sell" | 0 | 1;
  amount: number;
  walletPublicKey: string;
  walletKeypair?: Keypair; // Only needed for actual on-chain swaps
}

// Helper function to create buy transaction (SOL -> Token)
export async function createBuyTransaction(
  connection: Connection,
  params: {
    tokenMint: PublicKey;
    amount: number; // Amount in SOL
    buyerWallet: Keypair;
    sellerWallet: Keypair;
    tokenPrice: number; // Price in SOL per token
  }
) {
  const { tokenMint, amount, buyerWallet, sellerWallet, tokenPrice } = params;
  const tokenAmount = amount / tokenPrice; // Calculate token amount from SOL amount

  // Get the associated token account for the seller
  const sellerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    sellerWallet.publicKey
  );

  // Get or create the associated token account for the buyer
  const buyerTokenAccount = await getAssociatedTokenAddress(
    tokenMint, 
    buyerWallet.publicKey
  );

  // Create a transaction
  const transaction = new Transaction();

  // Create the buyer's associated token account if it doesn't exist
  transaction.add(
    createAssociatedTokenAccountInstruction(
      buyerWallet.publicKey, // payer
      buyerTokenAccount, // associated token account
      buyerWallet.publicKey, // owner
      tokenMint // mint
    )
  );

  // Transfer SOL from buyer to seller
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: buyerWallet.publicKey,
      toPubkey: sellerWallet.publicKey,
      lamports: amount * 1e9, // convert SOL to lamports
    })
  );

  // Transfer tokens from seller to buyer
  transaction.add(
    createTransferInstruction(
      sellerTokenAccount, // source
      buyerTokenAccount, // destination
      sellerWallet.publicKey, // owner
      Math.floor(tokenAmount * 1e9) // convert to token decimals (assuming 9 decimals)
    )
  );

  return transaction;
}

// Helper function to create sell transaction (Token -> SOL)
export async function createSellTransaction(
  connection: Connection,
  params: {
    tokenMint: PublicKey;
    amount: number; // Amount in tokens
    sellerWallet: Keypair;
    buyerWallet: Keypair;
    tokenPrice: number; // Price in SOL per token
  }
) {
  const { tokenMint, amount, sellerWallet, buyerWallet, tokenPrice } = params;
  const solAmount = amount * tokenPrice; // Calculate SOL amount from token amount

  // Get the associated token account for the seller
  const sellerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    sellerWallet.publicKey
  );

  // Create a transaction
  const transaction = new Transaction();

  // Transfer SOL from buyer to seller
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: buyerWallet.publicKey,
      toPubkey: sellerWallet.publicKey,
      lamports: Math.floor(solAmount * 1e9), // convert SOL to lamports
    })
  );

  // Transfer tokens from seller to buyer
  const buyerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    buyerWallet.publicKey
  );

  // Create the buyer's associated token account if it doesn't exist
  transaction.add(
    createAssociatedTokenAccountInstruction(
      sellerWallet.publicKey, // payer
      buyerTokenAccount, // associated token account
      buyerWallet.publicKey, // owner
      tokenMint // mint
    )
  );

  // Transfer tokens from seller to buyer
  transaction.add(
    createTransferInstruction(
      sellerTokenAccount, // source
      buyerTokenAccount, // destination
      sellerWallet.publicKey, // owner
      Math.floor(amount * 1e9) // convert to token decimals (assuming 9 decimals)
    )
  );

  return transaction;
}

// Main function to execute a token swap with a real wallet
export async function executeSwap(
  env: Env,
  params: SwapParams
): Promise<{
  success: boolean;
  txId?: string;
  price?: number;
  amountOut?: number;
  error?: string;
}> {
  try {
    // Initialize database
    const db = getDB(env);

    // Normalize direction
    const directionInt = 
      typeof params.direction === "string"
        ? params.direction.toLowerCase() === "buy" ? 0 : 1
        : typeof params.direction === "number"
        ? params.direction
        : -1;

    if (directionInt !== 0 && directionInt !== 1) {
      return { 
        success: false, 
        error: "Invalid direction. Must be 'buy', 'sell', 0, or 1" 
      };
    }

    // Get token details from database
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, params.tokenMint))
      .limit(1);

    if (!token || token.length === 0) {
      return { success: false, error: "Token not found" };
    }

    // Get price from database
    const price = token[0].currentPrice || 0.001;

    // Connect to Solana network
    const connection = new Connection(getRpcUrl(env), "confirmed");

    // In a production system, we would now:
    // 1. Use the passed wallet keypair to sign transactions
    // 2. Execute the swap using a DEX or liquidity pool
    // 3. Wait for confirmation and record the result
    // 4. Update token prices based on real market data

    // For now, we'll use a simulated transaction to record the swap
    // while we develop the real on-chain swap functionality
    const isBuy = directionInt === 0;
    const amountOut = isBuy ? params.amount / price : params.amount * price;

    // Generate a simulated transaction ID
    // In production, this would be a real Solana transaction hash
    const txId = `${isBuy ? "buy" : "sell"}-${Date.now().toString()}-${params.tokenMint.substring(0, 8)}`;

    // Record the swap in the database
    const swapId = crypto.randomUUID();
    await db.insert(swaps).values({
      id: swapId,
      tokenMint: params.tokenMint,
      user: params.walletPublicKey,
      type: "manual",
      direction: directionInt,
      amountIn: params.amount,
      amountOut,
      priceImpact: 0.01,
      price,
      txId,
      timestamp: new Date().toISOString(),
    });

    // Update token price based on the swap direction
    // In a real implementation, this would be based on market impact
    const priceAdjustment = isBuy ? 0.001 : -0.001;
    const newPrice = Math.max(0.0001, price + priceAdjustment);
    
    await db
      .update(tokens)
      .set({
        currentPrice: newPrice,
        tokenPriceUSD: newPrice * (token[0].solPriceUSD || 100),
        lastUpdated: new Date().toISOString(),
        volume24h: (token[0].volume24h || 0) + params.amount
      })
      .where(eq(tokens.mint, params.tokenMint));

    // Return the swap result
    return {
      success: true,
      txId,
      price,
      amountOut
    };
  } catch (error) {
    logger.error("Error executing swap:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during swap execution"
    };
  }
}

// Future implementation for real on-chain swaps
export async function executeOnChainSwap(
  env: Env,
  params: SwapParams
): Promise<{
  success: boolean;
  txId?: string;
  price?: number;
  amountOut?: number;
  error?: string;
}> {
  try {
    // This function will implement real on-chain swaps
    // using DEX or liquidity pools when we're ready
    // For now, it just forwards to the simulated swap
    return executeSwap(env, params);
  } catch (error) {
    logger.error("Error executing on-chain swap:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during on-chain swap execution"
    };
  }
} 