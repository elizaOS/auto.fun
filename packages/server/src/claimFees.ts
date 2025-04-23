import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { claim } from "@autodotfun/raydium/src/raydiumVault";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "@autodotfun/program/types/raydium_vault";
import * as raydium_vault_IDL from "@autodotfun/program/idl/raydium_vault.json";
import dotenv from 'dotenv';

dotenv.config();


export async function claimFees(nftMint: PublicKey, poolId: PublicKey, connection: Connection, claimer: PublicKey): Promise<string> {
   try {
      const wallet = Keypair.fromSecretKey(
         Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY!)),
      );

      // Build an Anchor provider.
      const provider = new AnchorProvider(
         connection,
         new Wallet(wallet),
         AnchorProvider.defaultOptions(),
      );

      const program = new Program<RaydiumVault>(
         raydium_vault_IDL as any,
         provider,
      );
      // try this 3 times if it fails
      const maxRetries = 3;
      let attempt = 0;
      let success = false;
      let txSignature = "";
      while (attempt < maxRetries && !success) {
         try {
            txSignature = await claim(
               program as any,
               wallet,
               nftMint,
               poolId,
               connection,
               claimer
            );
            success = true;
         } catch (error) {
            console.error("Error during claim attempt:", error);
            attempt++;
         }
      }
      if (!success) {
         throw new Error("Failed to claim after multiple attempts.");
      }

      console.log("Transaction Signature:", txSignature);
      return txSignature;
   } catch (error) {
      console.error("Error during claim:", error);
      throw error;
   }
}