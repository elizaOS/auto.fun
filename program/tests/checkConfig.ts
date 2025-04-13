import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import * as fs from 'fs';
import path from 'path';
import { Autofun } from './target/types/autofun';
import { Connection, PublicKey } from '@solana/web3.js';

// Set environment variables programmatically
process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com'; // or your preferred cluster
process.env.ANCHOR_WALLET = path.resolve(__dirname, './id.json'); // path to your wallet file

(async () => {
  // Set up the provider from the environment variables (e.g., ANCHOR_PROVIDER_URL, ANCHOR_WALLET)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the IDL; adjust the path as needed.
  const idlPath = path.resolve(__dirname, './target/idl/autofun.json');
  const idlText = fs.readFileSync(idlPath, 'utf8');
  const idl = JSON.parse(idlText);

  // The program ID (taken from your IDL "address" field)
  const programId = new web3.PublicKey('2P7CKAgY6SWXscAee1JsCrKXeK1ZpiMkTiBH7YdJvvBD');

  // Instantiate the program using Anchor's Program class.
  const program = anchor.workspace.Autofun as Program<Autofun>;

  // Derive the config PDA using the seed "config" (the bytes for "config" are [99, 111, 110, 102, 105, 103])
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  
  console.log("Config PDA:", configPDA.toBase58());

  // Fetch the account info using the provider's connection.
  const accountInfo = await provider.connection.getAccountInfo(configPDA, 'confirmed');
  if (!accountInfo) {
    console.error("Config account not found for PDA:", configPDA.toBase58());
    return;
  }

  // Log raw account data for debugging
  console.log("Raw account data:", accountInfo.data);

  try {
    // Decode the account data using the Anchor coder.
    const decodedConfig = program.coder.accounts.decode("Config", accountInfo.data);
    console.log("Decoded Config Account:", decodedConfig);
  } catch (error) {
    console.error("Error decoding account data:", error);
  }
})();

// Initialize connection to the Solana cluster
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Function to check if an account is initialized
async function checkAccountInitialization(accountPubkey: PublicKey) {
  try {
    const accountInfo = await connection.getAccountInfo(accountPubkey);
    if (accountInfo) {
      console.log(`Account ${accountPubkey.toBase58()} is initialized.`);
      console.log('Account data length:', accountInfo.data.length);
    } else {
      console.log(`Account ${accountPubkey.toBase58()} is not initialized.`);
    }
  } catch (error) {
    console.error(`Error fetching account info for ${accountPubkey.toBase58()}:`, error);
  }
}

// Main function to check all relevant accounts
(async () => {
  // Replace these with your actual PDA values
  const configPDA = new PublicKey('AkqKEiKgTWWAbVBWDtGzH32xx6CXd4d9NwgVDjgParBj');
  const globalVaultPDA = new PublicKey('2YmvA7xvrRTvMDWau7s4XSMQzk1sTt516NMBccCTkySQ');
  const globalWsolAccountPDA = new PublicKey('HfwboaGVhKq5XdPgEgdjXT1hWUiEZZ7EBa17Pa5LBUB7');

  console.log('Checking account initialization status...');
  await checkAccountInitialization(configPDA);
  await checkAccountInitialization(globalVaultPDA);
  await checkAccountInitialization(globalWsolAccountPDA);
})();
