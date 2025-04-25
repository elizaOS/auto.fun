import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import type { RaydiumVault } from '../target/types/raydium_vault';
import { vaultConfigSeed } from "./utils.ts"; // Removed .ts extension

(async () => {
  // Set up the provider from the environment variables
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Instantiate the raydium vault program using the generated types
  const raydiumProgram = anchor.workspace.RaydiumVault as Program<RaydiumVault>;

  // Derive the vault config PDA using the seed from utils
  const [vaultConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(vaultConfigSeed)], // Use imported seed
    raydiumProgram.programId
  );

  // Define the new manager authority public key
  // IMPORTANT: Replace with the ACTUAL desired new manager public key
  const newManagerAuthority = new anchor.web3.PublicKey('autozgbVb1EvhrTZTkpLekJRN4sN5hhGYpMMiY9kQ5S');

  console.log(`Attempting to change manager for vault: ${vaultConfigPDA.toString()}`);
  console.log(`Current authority (wallet): ${provider.wallet.publicKey.toString()}`);
  console.log(`New manager authority: ${newManagerAuthority.toString()}`);

  // Call the change_manager_authority function
  try {
    const txSignature = await raydiumProgram.methods
        .changeManagerAuthority(newManagerAuthority) // Call the correct method
        .accounts({
            authority: provider.wallet.publicKey, // Current manager authority MUST sign
            vaultConfig: vaultConfigPDA, // Reverted back to camelCase
        })
        .rpc();

    console.log("Transaction sent successfully!");
    console.log("Signature:", txSignature);

    // Optional: Fetch the updated vault config to verify the change
    const updatedVaultConfig = await raydiumProgram.account.vaultConfig.fetch(vaultConfigPDA);
    console.log("Updated manager authority:", updatedVaultConfig.managerAuthority.toString());
    if (updatedVaultConfig.managerAuthority.equals(newManagerAuthority)) {
      console.log("Manager authority updated successfully!");
    } else {
      console.error("Verification failed: Manager authority did not update.");
    }

  } catch (error) {
    console.error("Error changing manager authority:", error);
    // Log specific AnchorError details if available
    if (error instanceof anchor.AnchorError) {
        console.error("AnchorError Code:", error.error.errorCode.code);
        console.error("AnchorError Number:", error.error.errorCode.number);
        console.error("AnchorError Message:", error.error.errorMessage);
        console.error("Error Logs:", error.logs);
    }
  }
})(); 