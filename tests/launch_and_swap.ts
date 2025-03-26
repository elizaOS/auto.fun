import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Autofun } from "../target/types/autofun";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import * as assert from "assert";
import {
  SEED_CONFIG,
  SEED_BONDING_CURVE,
  TEST_NAME,
  TEST_SYMBOL,
  TEST_URI,
  SEED_GLOBAL,
} from "./constant";
import {
  getAssociatedTokenAccount,
} from "./utils";
require("dotenv").config();

describe("launch_and_swap", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Autofun as Program<Autofun>;

  const adminKp = Keypair.generate();
  const creatorKp = Keypair.generate();
  const tokenKp = Keypair.generate();

  console.log("admin: ", adminKp.publicKey.toBase58());
  console.log("creator: ", creatorKp.publicKey.toBase58());
  console.log("token: ", tokenKp.publicKey.toBase58());

  const connection = provider.connection;

  // Airdrop SOL to the creator for testing
  before(async () => {
    // Airdrop SOL to admin for creating config
    const airdropTx = await connection.requestAirdrop(
      adminKp.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropTx);

    // Airdrop SOL to creator for launch and swap
    const airdropTx2 = await connection.requestAirdrop(
      creatorKp.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropTx2);
  });

  it("correctly configured", async () => {
    // Create a config for testing
    const newConfig = {
      authority: adminKp.publicKey,
      pendingAuthority: PublicKey.default,
      teamWallet: adminKp.publicKey,

      initBondingCurve: Number(process.env.INIT_BONDING_CURVE || "30"),
      platformBuyFee: new BN(500), // 5% fee
      platformSellFee: new BN(500), // 5% fee
      curveLimit: new BN(4_000_000_000), // 4 SOL

      lamportAmountConfig: {
        range: { min: new BN(1000000000), max: new BN(100000000000) },
      },
      tokenSupplyConfig: { range: { min: new BN(5000), max: new BN(1000000000000000) } },
      tokenDecimalsConfig: { range: { min: 6, max: 9 } },
    };

    // Configure the program
    const tx = await program.methods
      .configure(newConfig)
      .accounts({
        payer: adminKp.publicKey,
      })
      .signers([adminKp])
      .rpc();

    console.log("Config tx signature:", tx);

    // Verify config is set up correctly
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);
    assert.equal(
      configAccount.authority.toString(),
      adminKp.publicKey.toString()
    );
  });

  it("launches token and swaps in one transaction", async () => {
    // Get config PDA
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    // Set parameters for launch and swap
    const decimals = 9;
    const tokenSupply = 1_000_000_000_000; // 1,000,000 tokens with 9 decimals
    const virtualLamportReserves = 1_000_000_000; // 1 SOL
    const swapAmount = 100_000_000; // 0.1 SOL for initial buy
    const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

    // Get creator's initial SOL balance
    const initialBalance = await connection.getBalance(creatorKp.publicKey);
    console.log("Initial creator SOL balance:", initialBalance);

    try {
      const tx = await program.methods
        .launchAndSwap(
          decimals,
          new BN(tokenSupply),
          new BN(virtualLamportReserves),
          TEST_NAME,
          TEST_SYMBOL,
          TEST_URI,
          new BN(swapAmount),
          new BN(0), // minimum receive amount (0 for testing)
          new BN(deadline)
        )
        .accounts({
          teamWallet: configAccount.teamWallet,
          creator: creatorKp.publicKey,
          token: tokenKp.publicKey,
        })
        .signers([creatorKp, tokenKp])
        .rpc();

      console.log("Launch and swap tx signature:", tx);

      // Check token was created
      const supply = await connection.getTokenSupply(tokenKp.publicKey);
      assert.equal(supply.value.amount, tokenSupply.toString());
      
      // Check creator received tokens
      const creatorTokenAccount = getAssociatedTokenAccount(
        creatorKp.publicKey,
        tokenKp.publicKey
      );
      const tokenBalance = await connection.getTokenAccountBalance(creatorTokenAccount);
      console.log("Creator token balance:", tokenBalance.value.uiAmount);
      
      // Assert creator has tokens (more than 0)
      assert.ok(Number(tokenBalance.value.amount) > 0, "Creator should have tokens after swap");
      
      // Check bonding curve was updated correctly
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
        program.programId
      );
      const curveAccount = await program.account.bondingCurve.fetch(bondingCurvePda);
      
      // Check the bonding curve was initialized correctly and has the SOL from the swap
      assert.equal(curveAccount.creator.toString(), creatorKp.publicKey.toString());
      assert.ok(curveAccount.reserveLamport.gt(new BN(virtualLamportReserves)), 
        "Bonding curve should have more SOL after swap");
      
      console.log("Bonding curve SOL reserve:", curveAccount.reserveLamport.toString());
      console.log("Bonding curve token reserve:", curveAccount.reserveToken.toString());
      
      // Check final SOL balance of creator
      const finalBalance = await connection.getBalance(creatorKp.publicKey);
      console.log("Final creator SOL balance:", finalBalance);
      
      // Creator should have spent more than the swap amount (also paid for token creation)
      assert.ok(initialBalance - finalBalance > swapAmount, 
        "Creator should have spent SOL for both token creation and swap");
        
    } catch (error) {
      console.log("Error: ", error);
    }
  });
}); 