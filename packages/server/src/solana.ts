import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Env } from "./env";
import { getRpcUrl } from "./utils";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import { Autofun } from "@autodotfun/program/types";
import * as idl from "@autodotfun/program/idl/autofun.json";

// Initialize the Solana configuration with the provided environment
export function initSolanaConfig(env?: Env) {
  // Set up network and RPC URL
  const network = env?.NETWORK;
  const rpcUrl = getRpcUrl(env);

  // Create UMI instance
  const umi = createUmi(rpcUrl);

  // Set up program ID based on network
  const programId = env?.PROGRAM_ID;

  if (!programId) {
    throw new Error("missing program_id env var");
  }

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

export const getProgram = (connection: Connection, wallet: any) => {
  const provider = new AnchorProvider(connection, wallet, {
    skipPreflight: true,
    commitment: "confirmed",
  });

  return new Program<Autofun>(idl as any, provider);
};
