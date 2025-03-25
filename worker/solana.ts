import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getRpcUrl, getLegacyRpcUrl } from "./util";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Env } from "./env";

// Initialize the Solana configuration with the provided environment
export function initSolanaConfig(env?: Env) {
  // Set up network and RPC URL
  const network = env?.NETWORK || "mainnet";
  const rpcUrl = env ? getRpcUrl(env) : "https://api.mainnet-beta.solana.com";

  // Create UMI instance
  const umi = createUmi(rpcUrl);

  // Set up program ID based on network
  const programId =
    network === "55QFMmfMVYNmxMWL5XY6FytSpa1Z5BZsYnbC8ATXzQYC";

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
