import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { claim } from "@autodotfun/raydium/src/raydiumVault";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import * as raydium_vault_IDL_JSON from "@autodotfun/types/idl/raydium_vault.json";
import { WebSocketClient } from "./websocket-client";
import { Token } from "./db";

const raydium_vault_IDL: RaydiumVault = JSON.parse(
  JSON.stringify(raydium_vault_IDL_JSON)
);

export async function claimFees(
  nftMint: PublicKey,
  poolId: PublicKey,
  connection: Connection,
  claimer: PublicKey,
  websocket: WebSocketClient,
  token: Token
): Promise<string> {
  try {
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY!))
    );

    // Build an Anchor provider.
    const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions()
    );

    const program = new Program<RaydiumVault>(
      raydium_vault_IDL as any,
      provider
    );
    // try this 3 times if it fails
    // const maxRetries = 3;
    // let attempt = 0;
    // let success = false;
    let txSignature = "";
    // while (attempt < maxRetries && !success) {
    try {
      txSignature = await claim(
        program as any,
        wallet,
        nftMint,
        poolId,
        connection,
        claimer,
        token
      );
    } catch (error) {
      console.error("Error during claim attempt:", error);
      // attempt++;
    }
    // }
    if (!txSignature) {
      throw new Error("Failed to claim after multiple attempts.");
    }
    websocket.to(`claimer:${claimer.toBase58()}`).emit("claim", {
      txSignature,
      poolId: poolId.toBase58(),
      claimer: claimer.toBase58(),
    });
    console.log("Transaction Signature:", txSignature);
    return txSignature;
  } catch (error) {
    console.error("Error during claim:", error);
    throw error;
  }
}
