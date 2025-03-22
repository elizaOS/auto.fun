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
  return env
    ? new Connection(getRpcUrl(env))
    : new Connection(getLegacyRpcUrl());
};

// Get a UMI instance with the provided environment
const getUmi = (env?: Env) => {
  return env
    ? createUmi(getRpcUrl(env)).use(mplTokenMetadata())
    : createUmi(getLegacyRpcUrl()).use(mplTokenMetadata());
};

// Create a wallet from the private key in the environment
const createWallet = (env?: Env) => {
  // Check if we have a wallet key in the environment
  if (env?.WALLET_PRIVATE_KEY) {
    try {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
        { skipValidation: true },
      );
      return new NodeWallet(keypair);
    } catch (error) {
      console.error("Failed to create wallet from env:", error);
    }
  }

  // No fallback for Cloudflare Workers environment
  throw new Error("No wallet private key available");
};

// Initialize the Solana configuration with the provided environment
export function initSolanaConfig(env?: Env) {
  // Set up network and RPC URL
  const network = env?.NETWORK || "mainnet";
  const rpcUrl = env ? getRpcUrl(env) : "https://api.mainnet-beta.solana.com";

  // Create UMI instance
  const umi = createUmi(rpcUrl);

  // Set up program ID based on network
  const programId =
    network === "devnet"
      ? "93DkYRHBM5KweFqzP7KzEZTMUy6sWvXgLdJq6uX1pZUP"
      : "55QFMmfMVYNmxMWL5XY6FytSpa1Z5BZsYnbC8ATXzQYC";

  // Create wallet if private key is available
  let wallet: Keypair | undefined;

  if (env?.WALLET_PRIVATE_KEY) {
    try {
      wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
      );
      console.log("Created wallet from env.WALLET_PRIVATE_KEY");
    } catch (error) {
      console.error("Failed to create wallet from env:", error);
    }
  }

  // Return configuration object
  return {
    umi,
    connection: new Connection(rpcUrl),
    program: null, // Will be initialized later if anchor is used
    programId: new PublicKey(programId),
    wallet,
    network,
  };
}
