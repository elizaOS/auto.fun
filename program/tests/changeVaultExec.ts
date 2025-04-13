import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { RaydiumVault } from '../target/types/raydium_vault';
import path from 'path';

// Set environment variables programmatically
process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com'; // or your preferred cluster
process.env.ANCHOR_WALLET = path.resolve(__dirname, '../id.json'); // path to your wallet file

(async () => {
  // Set up the provider from the environment variables
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Instantiate the raydium vault program using the generated types
  const raydiumProgram = anchor.workspace.RaydiumVault as Program<RaydiumVault>;

  // Derive the vault config PDA using the seed "raydium_vault_config"
  const [vaultConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("raydium_vault_config")],
    raydiumProgram.programId
  );

  // Define the new executor authority public key
  const newExecutorAuthority = new anchor.web3.PublicKey('42fg4k89w81wp7a4Nt9nvjunfg5WScLeo6tvp44Kjpy7'); // Replace with the actual new executor public key

  // Call the change_executor_authority function
  await raydiumProgram.methods.changeExecutorAuthority(newExecutorAuthority).accounts({
    authority: provider.wallet.publicKey, // Current manager authority
    vaultConfig: vaultConfigPDA,
  }).rpc();

  console.log("Executor authority changed successfully.");
})();