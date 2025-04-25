// check-admin.ts
import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import type { Autofun } from '../target/types/autofun.ts';
import type { RaydiumVault } from "../target/types/raydium_vault";
import BN from 'bn.js'; // Import BN for handling large numbers

(async () => {
  // Set up the provider from the environment variables
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Instantiate the program using the generated types
  const autofunProgram = anchor.workspace.Autofun as Program<Autofun>;
  const raydiumVaultProgram = anchor.workspace.RaydiumVault as Program<RaydiumVault>;

  // Derive the config PDA using the seed "config"
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    autofunProgram.programId
  );

  const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    autofunProgram.programId
  );

  // Derive the global WSOL account PDA using the seeds
  const globalWsolSeed = Buffer.from([
    6, 221, 246, 225, 215, 101, 161, 147,
    217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145,
    58, 140, 245, 133, 126, 255, 0, 169
  ]);

  // The native mint account is provided in the IDL.
  const nativeMint = new web3.PublicKey("So11111111111111111111111111111111111111112");

  const [globalWsolAccountPDA] = web3.PublicKey.findProgramAddressSync(
    [globalVaultPDA.toBuffer(), globalWsolSeed, nativeMint.toBuffer()],
    autofunProgram.programId
  );

  // Derive the vault config PDA using the seed "raydium_vault_config"
  const [vaultConfigPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("raydium_vault_config")],
    raydiumVaultProgram.programId
  );

  // Fetch the account info using the provider's connection.
  const autofunConfigPDA = await provider.connection.getAccountInfo(configPDA, 'confirmed');
  const globalVaultAccountInfo = await provider.connection.getAccountInfo(globalVaultPDA, 'confirmed');
  const vaultAccountInfo = await provider.connection.getAccountInfo(vaultConfigPDA, 'confirmed');

  // Check each account individually and log if not found
  if (!autofunConfigPDA) {
    console.error("Config account not found for PDA:", configPDA.toBase58());
  } else {
    try {
      const decodedAutofunConfig = autofunProgram.coder.accounts.decode("config", autofunConfigPDA.data);
      console.log("-------------------------------- Autofun Config --------------------------------");
      console.log("Config PDA:", configPDA.toBase58());
      console.log("Current Admin:", decodedAutofunConfig.authority.toString());
      console.log("Pending Admin:", decodedAutofunConfig.pendingAuthority.toString());
      console.log("Team Wallet:", decodedAutofunConfig.teamWallet.toString());
      console.log("Init Bonding Curve:", decodedAutofunConfig.initBondingCurve);
      console.log("Platform Buy Fee:", new BN(decodedAutofunConfig.platformBuyFee).toNumber());
      console.log("Platform Sell Fee:", new BN(decodedAutofunConfig.platformSellFee).toNumber());
      console.log("Curve Limit:", new BN(decodedAutofunConfig.curveLimit).toNumber());
      console.log("Lamport Amount Config:", {
        min: new BN(decodedAutofunConfig.lamportAmountConfig.range.min).toNumber(),
        max: new BN(decodedAutofunConfig.lamportAmountConfig.range.max).toNumber(),
      });
      console.log("Token Supply Config:", {
        min: new BN(decodedAutofunConfig.tokenSupplyConfig.range.min).toNumber(),
        max: new BN(decodedAutofunConfig.tokenSupplyConfig.range.max).toNumber(),
      });
      console.log("Token Decimals Config:", {
        min: decodedAutofunConfig.tokenDecimalsConfig.range.min,
        max: decodedAutofunConfig.tokenDecimalsConfig.range.max,
      });
    } catch (error) {
      console.error("Error decoding config account data:", error);
    }
  }

  if (!globalVaultAccountInfo) {
    console.error("Global vault account not found for PDA:", globalVaultPDA.toBase58());
  } else {
    // Decode and log global vault account data if needed
    console.log("Global Vault PDA:", globalVaultPDA.toBase58());
  }

  console.log("Global WSOL Account PDA:", globalWsolAccountPDA.toBase58());

  if (!vaultAccountInfo) {
    console.error("Vault config account not found for PDA:", vaultConfigPDA.toBase58());
  } else {
    try {
      const decodedVaultConfig = raydiumVaultProgram.coder.accounts.decode("vaultConfig", vaultAccountInfo.data);
      console.log("-------------------------------- Vault Config --------------------------------");
      console.log("Vault Config PDA:", vaultConfigPDA.toBase58());
      console.log("Executor Authority:", decodedVaultConfig.executorAuthority.toString());
      console.log("Emergency Authority:", decodedVaultConfig.emergencyAuthority.toString());
      console.log("Manager Authority:", decodedVaultConfig.managerAuthority.toString());
    } catch (error) {
      console.error("Error decoding vault config account data:", error);
    }
  }
})();