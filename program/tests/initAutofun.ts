import * as anchor from '@coral-xyz/anchor';
import { Program, web3, BN } from '@coral-xyz/anchor';
import { Autofun } from '../target/types/autofun';

(async () => {
  // Set up the Anchor provider (e.g., env variables and wallet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Instantiate the program using the IDL and programId.
  const program = anchor.workspace.Autofun as Program<Autofun>;

  // Derive the PDA for the "config" account.
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId
  );

  // Derive the PDA for the "global_vault" account.
  const [globalVault] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Prepare the seed for the "global_wsol_account" PDA.
  // The constant array is given in the IDL:
  const globalWsolSeed = Buffer.from([
    6, 221, 246, 225, 215, 101, 161, 147,
    217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145,
    58, 140, 245, 133, 126, 255, 0, 169
  ]);

  // The native mint account is provided in the IDL.
  const nativeMint = new web3.PublicKey("So11111111111111111111111111111111111111112");

  const [globalWsolAccount] = web3.PublicKey.findProgramAddressSync(
    [globalVault.toBuffer(), globalWsolSeed, nativeMint.toBuffer()],
    program.programId
  );

  // Define your new configuration data.
  // Adjust these fields as needed to your deployment requirements.
  const newConfig = {
    authority: provider.wallet.publicKey,
    pendingAuthority: provider.wallet.publicKey,
    teamWallet: new anchor.web3.PublicKey(
      "FfNhJtoWL6Nk9UkiZiitYifcBMFUicaJswKj6CFdFNSa"
    ),
    initBondingCurve: new BN(100),
    platformBuyFee: new BN(100),
    platformSellFee: new BN(100),
    curveLimit: new BN(1130000000),
    lamportAmountConfig: { range: { min: new BN(0.01 * anchor.web3.LAMPORTS_PER_SOL), max: new BN(100 * anchor.web3.LAMPORTS_PER_SOL) } },
    tokenSupplyConfig: { range: { min: new BN(5000), max: new BN(1000000000000000) } },
    tokenDecimalsConfig: { range: { min: 6, max: 9 } }
  };

  // Add logging to verify the configuration object
  console.log("New Config:", newConfig);
  console.log("Config PDA:", configPDA.toBase58());
  console.log("Global Vault PDA:", globalVault.toBase58());
  console.log("Global WSOL Account PDA:", globalWsolAccount.toBase58());

  // Send the configure transaction.
  try {
    const txSignature = await program.methods.configure(newConfig).accounts({
      payer: provider.wallet.publicKey,
      config: configPDA,
      global_vault: globalVault,
      global_wsol_account: globalWsolAccount,
      native_mint: nativeMint,
      system_program: web3.SystemProgram.programId,
      token_program: new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      associated_token_program: new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    }).rpc();

    console.log("Transaction sent successfully!");
    console.log("Signature:", txSignature);
  } catch (err) {
    console.error("Transaction failed:", err);
  }
})();
