import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getRpcUrl, getLegacyRpcUrl } from "./util";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Env } from "./env";

// The program ID 
const PROGRAM_ID = new PublicKey("6qXDRh3nSj9isLRDpUqXWyK1nR9eHBVLrdLZpjeoNfc");

// Get a Solana connection with the provided environment
const getSolanaConnection = (env?: Env) => {
  return env ? new Connection(getRpcUrl(env)) : new Connection(getLegacyRpcUrl());
};

// Get a UMI instance with the provided environment
const getUmi = (env?: Env) => {
  return env ? 
    createUmi(getRpcUrl(env)).use(mplTokenMetadata()) : 
    createUmi(getLegacyRpcUrl()).use(mplTokenMetadata());
};

// Create a wallet from the private key in the environment
const createWallet = (env?: Env) => {
  // Check if we have a wallet key in the environment
  if (env?.WALLET_PRIVATE_KEY) {
    try {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
        { skipValidation: true }
      );
      return new NodeWallet(keypair);
    } catch (error) {
      console.error("Failed to create wallet from env:", error);
    }
  }
  
  // Fallback to process.env for local development
  if (process.env.WALLET_PRIVATE_KEY) {
    try {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
        { skipValidation: true }
      );
      return new NodeWallet(keypair);
    } catch (error) {
      console.error("Failed to create wallet from process.env:", error);
    }
  }
  
  throw new Error("No wallet private key available");
};

// Initialize the Solana configuration with the provided environment
export const initSolanaConfig = (env?: Env) => {
  try {
    return {
      connection: getSolanaConnection(env),
      programId: PROGRAM_ID,
      umi: getUmi(env),
      wallet: createWallet(env),
    };
  } catch (error) {
    throw new Error("Failed to initialize Solana config:", error as Error);
  }
};