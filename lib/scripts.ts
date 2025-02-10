import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

import { Serlaunchalot } from "../target/types/serlaunchalot";
import { SEED_BONDING_CURVE, SEED_CONFIG } from "./constant";
import { VanityKeypair } from "../schemas";
import { calculateAmountOutSell } from "../tests/utils";
import { calculateAmountOutBuy } from "../tests/utils";

const FEE_BASIS_POINTS = 10000;

export const createConfigTx = async (
  admin: PublicKey,

  newConfig: any,

  connection: Connection,
  program: Program<Serlaunchalot>
) => {

  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );

  console.log("configPda: ", configPda.toBase58());

  // Create compute budget instructions
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    units: 300000 // Increase compute units
  });
  
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50000 // Add priority fee
  });

  // Get the transaction
  const configTx = await program.methods
    .configure(newConfig)
    .accounts({
      payer: admin
    })
    .transaction();

  // Add compute budget instructions at the beginning
  configTx.instructions = [
    modifyComputeUnits,
    addPriorityFee,
    ...configTx.instructions
  ];

  configTx.feePayer = admin;
  configTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return configTx;
};

export const launchTokenTx = async (
  decimal: number,
  supply: number,
  reserve: number,
  name: string,
  symbol: string,
  uri: string,

  user: PublicKey,

  connection: Connection,
  program: Program<Serlaunchalot>
) => {
    // Auth our user (register/login)
    const jwt = await fetch(`${process.env.API_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: user.toBase58()
      })
    })

    if (!jwt.ok) {
        throw new Error('Failed to register or login user wallet');
    }
    interface AuthResponse {
      user: {
        address: string;
      };
      token: string;
    }

    const jwtData = await jwt.json() as AuthResponse;

    // Get pre-generated keypair from server
    const response = await fetch(`${process.env.API_URL}/vanity-keypair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtData.token}`
      },
      body: JSON.stringify({ address: user.toBase58() })
    });

    if (!response.ok) {
      throw new Error('Failed to get vanity keypair');
    }
    interface VanityKeypairResponse {
      address: string;
      secretKey: number[];
    }
    const { secretKey } = await response.json() as VanityKeypairResponse;
    const tokenKp = Keypair.fromSecretKey(new Uint8Array(secretKey));
 
   console.log("Using pre-generated vanity address:", tokenKp.publicKey.toBase58());

  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );

  console.log("configPda: ", configPda.toBase58());
  const configAccount = await program.account.config.fetch(configPda);
  
  // Send the transaction to launch a token
  const tx = await program.methods
    .launch(
      //  launch config
      decimal,
      new BN(supply),
      new BN(reserve),

      //  metadata
      name,
      symbol,
      uri
    )
    .accounts({
      creator: user,
      token: tokenKp.publicKey,
      teamWallet: configAccount.teamWallet
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  tx.sign(tokenKp);

  return tx;
}

export const swapTx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Serlaunchalot>
) => {
  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );
  const configAccount = await program.account.config.fetch(configPda);
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_BONDING_CURVE), token.toBytes()],
    program.programId
  );
  const curve = await program.account.bondingCurve.fetch(bondingCurvePda);

  // Apply platform fee
  const feePercent = style === 1 ? Number(configAccount.platformSellFee) : Number(configAccount.platformBuyFee);
  const adjustedAmount = Math.floor(amount * (FEE_BASIS_POINTS - feePercent) / FEE_BASIS_POINTS);

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) { // Buy
    estimatedOutput = calculateAmountOutBuy(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      9, // SOL decimals
      curve.reserveToken.toNumber()
    );
  } else { // Sell
    estimatedOutput = calculateAmountOutSell(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      9,
      curve.reserveToken.toNumber()
    );
  }

  // Apply slippage to estimated output
  const minOutput = new BN(Math.floor(estimatedOutput * (10000 - slippageBps) / 10000));

  const deadline = Math.floor(Date.now() / 1000) + 120;

  const tx = await program.methods
    .swap(new BN(amount), style, minOutput, new BN(deadline))
    .accounts({
      teamWallet: configAccount.teamWallet,
      user,
      tokenMint: token
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}

export const withdrawTx = async (
  user: PublicKey,
  token: PublicKey,

  connection: Connection,
  program: Program<Serlaunchalot>
) => {

  const tx = await program.methods
    .withdraw()
    .accounts({
      admin: user,
      tokenMint: token
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}