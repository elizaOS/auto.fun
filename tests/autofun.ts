import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Autofun } from "../target/types/autofun";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionConfirmationStrategy,
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
  calculateAmountOutBuy,
  convertFromFloat,
  convertToFloat,
  getAssociatedTokenAccount,
} from "./utils";
import { createMarket } from "../lib/create-market";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
require("dotenv").config();

// const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// const associatedTokenProgram = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// const metadataProgram = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

describe("autofun", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Autofun as Program<Autofun>;

  const adminKp = Keypair.generate();
  const userKp = Keypair.generate();
  const user2Kp = Keypair.generate();
  const tokenKp = Keypair.generate();

  console.log("admin: ", adminKp.publicKey.toBase58());
  console.log("user: ", userKp.publicKey.toBase58());
  console.log("user2: ", user2Kp.publicKey.toBase58());

  const connection = provider.connection;

  before(async () => {
    // console.log("airdrop SOL to admin");

    // const airdropTx = await connection.requestAirdrop(
    //   adminKp.publicKey,
    //   1 * LAMPORTS_PER_SOL
    // );
    // await connection.confirmTransaction({
    //   signature: airdropTx,
    //   abortSignal: AbortSignal.timeout(1000),
    // } as TransactionConfirmationStrategy);

    // console.log("airdrop SOL to user");
    // const airdropTx2 = await connection.requestAirdrop(
    //   userKp.publicKey,
    //   1 * LAMPORTS_PER_SOL
    // );
    // await connection.confirmTransaction({
    //   signature: airdropTx2,
    //   abortSignal: AbortSignal.timeout(1000),
    // } as TransactionConfirmationStrategy);

    // console.log("airdrop SOL to user2");
    // const airdropTx3 = await connection.requestAirdrop(
    //   user2Kp.publicKey,
    //   1 * LAMPORTS_PER_SOL
    // );
    // await connection.confirmTransaction({
    //   signature: airdropTx3,
    //   abortSignal: AbortSignal.timeout(1000),
    // } as TransactionConfirmationStrategy);
  });

  it("correctly configured", async () => {
    // Create a dummy config object to pass as argument.
    const newConfig = {
      authority: adminKp.publicKey,
      pendingAuthority: PublicKey.default,
      platformMigrationFee: 0,
      teamWallet: adminKp.publicKey,

      initBondingCurve: Number(process.env.INIT_BONDING_CURVE),

      platformBuyFee: 500n, // Example fee: 5% = 500 basis points
      platformSellFee: 500n, // Example fee: 5% = 500 basis points

      curveLimit: new BN(4_000_000_000), //  Example limit: 2 SOL

      lamportAmountConfig: {
        range: { min: new BN(1000000000), max: new BN(100000000000) },
      },
      tokenSupplyConfig: { range: { min: new BN(5000), max: new BN(1000000000000000) } },
      tokenDecimalsConfig: { range: { min: 6, max: 9 } },
    };

    // Send the transaction to configure the program.
    const tx = await program.methods
      .configure(newConfig)
      .accounts({
        payer: adminKp.publicKey,
      })
      .signers([adminKp])
      .rpc();

    console.log("tx signature:", tx);

    // get PDA for the config account using the seed "config".
    const [configPda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );

    // Log PDA details for debugging.
    console.log("config PDA:", configPda.toString());

    // Fetch the updated config account to validate the changes.
    const configAccount = await program.account.config.fetch(configPda);

    // Assertions to verify configuration
    assert.equal(
      configAccount.authority.toString(),
      adminKp.publicKey.toString()
    );
    assert.equal(configAccount.platformBuyFee, 500n);
    assert.equal(configAccount.platformSellFee, 500n);
    assert.equal(
      parseFloat(configAccount.lamportAmountConfig.range.min.toString()),
      1000000000
    );

    assert.equal(
      parseFloat(configAccount.lamportAmountConfig.range.max.toString()),
      100000000000
    );
    assert.equal(
      parseFloat(configAccount.tokenSupplyConfig.range.min.toString()),
      5000
    );
    assert.equal(
      parseFloat(configAccount.tokenSupplyConfig.range.max.toString()),
      2000000
    );
    assert.equal(
      parseFloat(configAccount.tokenDecimalsConfig.range.min.toString()),
      6
    );
    assert.equal(
      parseFloat(configAccount.tokenDecimalsConfig.range.max.toString()),
      9
    );
    assert.equal(configAccount.initBondingCurve, process.env.INIT_BONDING_CURVE);
  });

  it("token created", async () => {
    console.log("token: ", tokenKp.publicKey.toBase58());
    // get PDA for the config account using the seed "config".
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    // Send the transaction to launch a token

    const tx = await program.methods
      .launch(
        //  launch config
        Number(process.env.DECIMALS),
        new BN(Number(process.env.TOKEN_SUPPLY)),
        new BN(Number(process.env.VIRTUAL_RESERVES)),

        //  metadata
        TEST_NAME,
        TEST_SYMBOL,
        TEST_URI
      )
      .accounts({
        creator: userKp.publicKey,
        token: tokenKp.publicKey,
        teamWallet: configAccount.teamWallet,
      })
      .signers([userKp, tokenKp])
      .rpc();

    console.log("tx signature:", tx);

    // get token detailed info
    const supply = await connection.getTokenSupply(tokenKp.publicKey);

    // Assertions to verify configuration
    assert.equal(supply.value.amount, process.env.TOKEN_SUPPLY);

    // check launch phase is 'Presale'
    const [bondingCurvePda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );

    console.log("bonding curve PDA:", bondingCurvePda.toString());

    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    // Assertions to verify configuration
    assert.equal(curveAccount.creator.toBase58(), userKp.publicKey.toBase58());

    // assertions balances
    const teamTokenAccount = getAssociatedTokenAccount(
      adminKp.publicKey,
      tokenKp.publicKey
    );
    const [global_vault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_GLOBAL)],
      program.programId
    );
    const globalVaultTokenAccount = getAssociatedTokenAccount(
      global_vault,
      tokenKp.publicKey
    );
    const teamTokenBalance = await connection.getTokenAccountBalance(
      teamTokenAccount
    );
    const globalVaultBalance = await connection.getTokenAccountBalance(
      globalVaultTokenAccount
    );
    assert.equal(
      teamTokenBalance.value.amount,
      (Number(process.env.TOKEN_SUPPLY) * (100 - Number(process.env.INIT_BONDING_CURVE))) / 100
    );
    assert.equal(
      globalVaultBalance.value.amount,
      (Number(process.env.TOKEN_SUPPLY) * Number(process.env.INIT_BONDING_CURVE)) / 100
    );
  });

  // trade SOL for token
  it("user1's swap SOL for token completed", async () => {
    const [configPda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

    // case 1: failed because minimum receive is too high because of slippage
    try {
      await program.methods
        .swap(new BN(5_000_000), 0, new BN(5_000_000_0), new BN(deadline))
        .accounts({
          teamWallet: configAccount.teamWallet,
          user: userKp.publicKey,
          tokenMint: tokenKp.publicKey,
        })
        .signers([userKp])
        .rpc();
    } catch (error) {
      assert.match(
        JSON.stringify(error),
        /Return amount is too small compared to the minimum received amount./
      );
    }

    // case 2: happy case. Send the transaction to launch a token
    const tx = await program.methods
      .swap(new BN(5_000_000), 0, new BN(0), new BN(deadline))
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: userKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([userKp])
      .rpc();

    console.log("tx signature:", tx);

    //  check user1's balance
    const tokenAccount = getAssociatedTokenAccount(
      userKp.publicKey,
      tokenKp.publicKey
    );
    const balance = await connection.getBalance(userKp.publicKey);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

    console.log("buyer: ", userKp.publicKey.toBase58());
    console.log("lamports: ", balance);
    console.log("token amount: ", tokenBalance.value.uiAmount);

    const [global_vault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_GLOBAL)],
      program.programId
    );
    const globalVaultTokenAccount = getAssociatedTokenAccount(
      global_vault,
      tokenKp.publicKey
    );
    const globalVaultBalance = await connection.getTokenAccountBalance(
      globalVaultTokenAccount
    );
    console.log("global token balance: ", globalVaultBalance.value.amount);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curvePda = await program.account.bondingCurve.fetch(bondingCurvePda);

    console.log("reserve_token: ", curvePda.reserveToken.toNumber());
  });

  it("user1's swap Token for SOL completed", async () => {
    const [configPda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    //  check user1's balance
    const tokenAccount = getAssociatedTokenAccount(
      userKp.publicKey,
      tokenKp.publicKey
    );
    let tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
    console.log("token amount before swap: ", tokenBalance.value.amount);

    const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

    // Send the transaction to launch a token
    const tx = await program.methods
      .swap(new BN(tokenBalance.value.amount), 1, new BN(0), new BN(deadline))
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: userKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([userKp])
      .rpc();

    console.log("tx signature:", tx);

    const balance = await connection.getBalance(userKp.publicKey);
    tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

    console.log("buyer: ", userKp.publicKey.toBase58());
    console.log("lamports: ", balance);
    console.log("token amount: ", tokenBalance.value.uiAmount);

    const [global_vault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_GLOBAL)],
      program.programId
    );
    const globalVaultTokenAccount = getAssociatedTokenAccount(
      global_vault,
      tokenKp.publicKey
    );
    const globalVaultBalance = await connection.getTokenAccountBalance(
      globalVaultTokenAccount
    );
    console.log("global token balance: ", globalVaultBalance.value.amount);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curvePda = await program.account.bondingCurve.fetch(bondingCurvePda);

    console.log("reserve_token: ", curvePda.reserveToken.toNumber());
  });

  it("curve reached the limit", async () => {
    const [configPda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

    // Send the transaction to launch a token
    const tx = await program.methods
      .swap(new BN(4_000_000_000), 0, new BN(0), new BN(deadline))
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: user2Kp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([user2Kp])
      .rpc();

    console.log("tx signature:", tx);

    //  check user2's balance
    const tokenAccount = getAssociatedTokenAccount(
      user2Kp.publicKey,
      tokenKp.publicKey
    );
    const balance = await connection.getBalance(user2Kp.publicKey);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

    console.log("buyer: ", user2Kp.publicKey.toBase58());
    console.log("lamports: ", balance);
    console.log("token amount: ", tokenBalance.value.uiAmount);

    // check launch phase is 'completed'
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );

    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    // Assertions to verify configuration
    assert.equal(curveAccount.isCompleted, true);
    assert.equal(
      curveAccount.reserveLamport.toNumber(),
      configAccount.curveLimit.toNumber()
    );
  });

  it("Admin withdrew token and SOL", async () => {
    const [configPda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    const configAccount = await program.account.config.fetch(configPda);

    // Send the transaction to withdraw a token
    const tx = await program.methods
      .withdraw()
      .accounts({
        admin: adminKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([adminKp])
      .rpc();

    console.log("tx signature:", tx);

    //  check admin's balance
    const tokenAccount = getAssociatedTokenAccount(
      adminKp.publicKey,
      tokenKp.publicKey
    );
    const balance = await connection.getBalance(adminKp.publicKey);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

    console.log("withdrawn lamports: ", balance);
    console.log("withdrawn token amount: ", tokenBalance.value.uiAmount);

    // check reversed amount
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );

    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    // Assertions to verify configuration
    assert.equal(curveAccount.reserveLamport, 0);
    assert.equal(curveAccount.reserveToken, 0);
  });
});

// solana-test-validator -r --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s spl-programs/metadata.so --bpf-program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA spl-programs/token.so --bpf-program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL spl-programs/associatedtoken.so
