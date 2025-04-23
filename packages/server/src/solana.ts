import * as idlJson from "@autodotfun/program/idl/autofun.json";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
const idl: Autofun = JSON.parse(JSON.stringify(idlJson));

import { Autofun } from "@autodotfun/program/types/autofun";
import { getRpcUrl } from "./util";
// Initialize the Solana configuration with the provided environment
export function initSolanaConfig() {
  // Set up network and RPC URL
  const network = process.env.NETWORK;
  const rpcUrl = getRpcUrl();

  // Create UMI instance
  const umi = createUmi(rpcUrl);

  // Set up program ID based on network
  const programId =
    network === "devnet"
      ? process.env.DEVNET_PROGRAM_ID || process.env.PROGRAM_ID
      : process.env.PROGRAM_ID;

  if (!programId) {
    throw new Error("missing program_id env var");
  }

  // Create wallet if private key is available
  let wallet: Keypair | undefined;

  if(!process.env.WALLET_PRIVATE_KEY){
    throw new Error("missing WALLET_PRIVATE_KEY env var");
  }

    try {
      wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
      );
      console.log("Created wallet from process.env.WALLET_PRIVATE_KEY");
    } catch (error) {
      console.error("Failed to create wallet from env:", error);
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

  return new Program<Autofun>(idl, provider);
};
