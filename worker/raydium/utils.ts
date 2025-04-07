import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import {
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";

export const fixedPoint = parseFloat("1000000000");
export const vaultConfigSeed = "raydium_vault_config";
export const positionSeed = "raydium_position";
export const claimerInfoSeed = "raydium_claimer_info";
export const nftFaucetSeed = "raydium_vault_nft_seed";

/// USDC
const token0 = new anchor.web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const claimer_address_0 = new anchor.web3.PublicKey(
  "6HHoqvXfNF1aQpwhn4k13CL7iyzFpjghLhG2eBG6xMVV"
);

const devnetEndpoint = "https://api.devnet.solana.com";

export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delay: number
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

export const sendSolTo = async (
  amount: any,
  signerWallet: any,
  recvWallet: anchor.web3.PublicKey,
  connection: anchor.web3.Connection
) => {
  const beforeBal = await connection.getBalance(recvWallet);
  console.log("beforeBal: ", parseFloat(beforeBal.toString()) / fixedPoint);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: signerWallet.publicKey,
      toPubkey: recvWallet,
      lamports: amount,
    })
  );

  try {
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      signerWallet,
    ]);
    console.log("confirmed transaction with signature ", signature);
  } catch (error: any) {
    console.log("transaction failed: ", error);
  }

  const afterBal = await connection.getBalance(recvWallet);
  console.log("afterBal: ", parseFloat(afterBal.toString()) / fixedPoint);
};

export const sendTokenTo = async (
  amount: any,
  signerWallet: any,
  recvWallet: anchor.web3.PublicKey,
  tokenAddress: anchor.web3.PublicKey,
  connection: anchor.web3.Connection
) => {
  const signerTokenAccount = spl.getAssociatedTokenAddressSync(
    tokenAddress,
    signerWallet.publicKey
  );
  const bobTokenAccount = spl.getAssociatedTokenAddressSync(
    tokenAddress,
    recvWallet
  );

  const beforeSignerBal =
    await connection.getTokenAccountBalance(signerTokenAccount);
  const beforeBobBal = await connection.getTokenAccountBalance(bobTokenAccount);

  const transaction = new Transaction().add(
    spl.createTransferInstruction(
      signerTokenAccount,
      bobTokenAccount,
      signerWallet.publicKey,
      amount,
      [],
      spl.TOKEN_PROGRAM_ID
    )
  );
  const signature = await connection.sendTransaction(transaction, [
    signerWallet,
  ]);
  await connection.confirmTransaction(signature, "confirmed");

  const afterSignerBal =
    await connection.getTokenAccountBalance(signerTokenAccount);
  const afterBobBal = await connection.getTokenAccountBalance(bobTokenAccount);
};

export const sendNftTo = async (
  signerWallet: Keypair,
  recvWallet: anchor.web3.PublicKey,
  nftMinted: anchor.web3.PublicKey,
  connection: anchor.web3.Connection
) => {
  try {
    // Derive the associated token addresses
    const signerTokenAccount = spl.getAssociatedTokenAddressSync(
      nftMinted,
      signerWallet.publicKey
    );
    const bobTokenAccount = spl.getAssociatedTokenAddressSync(
      nftMinted,
      recvWallet
    );

    // Create the transfer instruction
    const transferIx = spl.createTransferInstruction(
      signerTokenAccount,
      bobTokenAccount,
      signerWallet.publicKey,
      1, // transferring one NFT (1 token)
      [],
      spl.TOKEN_PROGRAM_ID
    );

    // Get the latest blockhash needed for the transaction
    const latestBlockhash = await connection.getLatestBlockhash();

    // Create a message using the new TransactionMessage API
    const messageV0 = new TransactionMessage({
      payerKey: signerWallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [transferIx],
    }).compileToV0Message();

    // Build the versioned transaction
    const transaction = new VersionedTransaction(messageV0);

    // Sign the transaction with the signer wallet
    transaction.sign([signerWallet]);

    // Send the versioned transaction
    const signature = await connection.sendTransaction(transaction);

    // Confirm the transaction using the latest blockhash context
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    return signature;
  } catch (error) {
    console.error("Error in sendNftTo:", error);
    throw error;
  }
};

export const isDevnet = (connection: anchor.web3.Connection): boolean => {
  return connection.rpcEndpoint == devnetEndpoint;
};

module.exports = {
  sendSolTo,
  sendTokenTo,
  isDevnet,
  retryOperation,
  vaultConfigSeed,
  positionSeed,
  claimerInfoSeed,
  nftFaucetSeed,
  claimer_address_0,
};
