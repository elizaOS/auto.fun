import * as anchor from '@coral-xyz/anchor';
import { Program, web3, BN } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { Autofun } from '../target/types/autofun';
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

(async () => {
    // Set up the Anchor provider (e.g., env variables and wallet)
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        (provider.wallet as NodeWallet).payer.secretKey
    );

    // Instantiate the program using the IDL and programId.
    const program = anchor.workspace.Autofun as Program<Autofun>;

    // Constants for token metadata
    const name = "YourTokenName";
    const symbol = "YTN";
    const uri = "https://example.com/metadata.json";
    const decimals = 6;
    const token_supply = new anchor.BN(1000000000000000);
    const virtual_lamport_reserves = new anchor.BN(280000000);

    console.log("Decimals:", decimals);
    console.log("Token Supply:", token_supply.toNumber());
    console.log("Virtual Reserves:", virtual_lamport_reserves.toNumber());
  
    // Derive the PDA for the "config" account.
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId
  );

  // Fetch the config account
  const configAccount = await program.account.config.fetch(configPDA);

  // Generate keypairs for the token
  const tokenKp = Keypair.generate();

  // Send the transaction to launch a token
  try {
    const tx = await program.methods
      .launch(
        decimals,
        token_supply,
        virtual_lamport_reserves,
        name,
        symbol,
        uri
      )
      .accounts({
        creator: provider.wallet.publicKey,
        token: tokenKp.publicKey,
        teamWallet: configAccount.teamWallet,
      })
      .signers([signerWallet, tokenKp])
      .rpc();

    console.log("Transaction successful with signature:", tx);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
})();