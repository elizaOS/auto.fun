import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import type { Autofun } from '../target/types/autofun.ts';

(async () => {
  console.log("Starting acceptAuthority");

  // IMPORTANT: Set up the Anchor provider.
  // This MUST be configured with the keypair of the PENDING authority.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const pendingAuthorityWallet = provider.wallet;
  console.log(`Attempting to accept authority as: ${pendingAuthorityWallet.publicKey.toBase58()}`);

  // Instantiate the program using the IDL and programId.
  const program = anchor.workspace.Autofun as Program<Autofun>;
  console.log("Using Autofun program ID:", program.programId.toBase58());

  // Derive the PDA for the "config" account.
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId
  );
  console.log("Config PDA:", configPDA.toBase58());

  // Define accounts for the accept_authority instruction
  const accounts = {
    newAdmin: pendingAuthorityWallet.publicKey, // The signer *is* the new admin
    globalConfig: configPDA,
  };

  // Send the accept_authority transaction.
  try {
    // Fetch the current config state to check pending authority *before* sending
    const configState = await program.account.config.fetch(configPDA);
    console.log(`Current on-chain authority: ${configState.authority.toBase58()}`);
    console.log(`Current on-chain pending authority: ${configState.pendingAuthority.toBase58()}`);

    if (configState.pendingAuthority.equals(web3.PublicKey.default)) {
      console.error("Error: No pending authority set in the config account. Run nominate_authority first.");
      return;
    }

    if (!configState.pendingAuthority.equals(pendingAuthorityWallet.publicKey)) {
        console.error(`Error: The configured wallet (${pendingAuthorityWallet.publicKey.toBase58()}) does not match the pending authority (${configState.pendingAuthority.toBase58()}) set in the config account.`);
        return;
    }

    console.log("Sending accept_authority transaction...");
    const txSignature = await program.methods
      .acceptAuthority()
      .accounts(accounts)
      // No need for .signers() explicitly here as AnchorProvider handles the wallet signer
      .rpc();

    console.log("Transaction sent successfully!");
    console.log("Signature:", txSignature);

    // Verify the change
    const updatedConfigState = await program.account.config.fetch(configPDA);
    console.log(`New on-chain authority: ${updatedConfigState.authority.toBase58()}`);
    console.log(`New on-chain pending authority: ${updatedConfigState.pendingAuthority.toBase58()} (should be default)`);

    if (updatedConfigState.authority.equals(pendingAuthorityWallet.publicKey)) {
        console.log("Authority successfully updated!");
    } else {
        console.error("Error: Authority was not updated correctly after transaction.");
    }

  } catch (err) {
    console.error("Accept Authority transaction failed:", err);
    // Potentially log more details if available
    if (err instanceof anchor.AnchorError) {
        console.error("AnchorError Details:", err.error);
        console.error("Error Logs:", err.logs);
    }
  }
})(); 