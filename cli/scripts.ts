import * as anchor from "@coral-xyz/anchor";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import fs from "fs";

import { Keypair, Connection, PublicKey } from "@solana/web3.js";

import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

import { Serlaunchalot } from "../target/types/serlaunchalot";
import {
  createConfigTx,
  launchTokenTx,
  swapTx,
  withdrawTx,
} from "../lib/scripts";
import { execTx, execWithdrawTx } from "../lib/util";
import {
  TEST_NAME,
  TEST_SYMBOL,
  TEST_URI,
} from "../lib/constant";
import { createMarket } from "../lib/create-market";

let solConnection: Connection = null;
let program: Program<Serlaunchalot> = null;
let payer: NodeWallet = null;

/**
 * Set cluster, provider, program
 * If rpc != null use rpc, otherwise use cluster param
 * @param cluster - cluster ex. mainnet-beta, devnet ...
 * @param keypair - wallet keypair
 * @param rpc - rpc
 */
export const setClusterConfig = async (
  cluster: web3.Cluster,
  keypair: string,
  rpc?: string
) => {
  if (!rpc) {
    solConnection = new web3.Connection(web3.clusterApiUrl(cluster));
  } else {
    solConnection = new web3.Connection(rpc);
  }

  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
    { skipValidation: true }
  );
  payer = new NodeWallet(walletKeypair);

  console.log("Wallet Address: ", payer.publicKey.toBase58());

  anchor.setProvider(
    new anchor.AnchorProvider(solConnection, payer, {
      skipPreflight: true,
      maxRetries: 3,
      commitment: "confirmed",
      preflightCommitment: "confirmed"
    })
  );

  // Generate the program client from IDL.
  program = anchor.workspace.Serlaunchalot as Program<Serlaunchalot>;

  console.log("ProgramId: ", program.programId.toBase58());
};

export const configProject = async () => {
  // Create a dummy config object to pass as argument.
  const newConfig = {
    authority: payer.publicKey,
    pendingAuthority: PublicKey.default,

    teamWallet: payer.publicKey,

    initBondingCurve: process.env.INIT_BONDING_CURVE,
    platformBuyFee: process.env.SWAP_FEE, // Example fee: 1% (1.0)
    platformSellFee: process.env.SWAP_FEE, // Example fee: 1% (1.0)

    curveLimit: new BN(process.env.CURVE_LIMIT), //  Example limit: 4 SOL

    lamportAmountConfig: {
      range: { min: new BN(1000000000), max: new BN(100000000000) },
    },
    tokenSupplyConfig: { range: { min: new BN(5000), max: new BN(1000000000000000) } },
    tokenDecimalsConfig: { range: { min: 6, max: 9 } },
  };

  const tx = await createConfigTx(
    payer.publicKey,
    newConfig,
    solConnection,
    program
  );

  await execTx(tx, solConnection, payer);
};

export const launchToken = async () => {
  const tx = await launchTokenTx(
    Number(process.env.DECIMALS),
    Number(process.env.TOKEN_SUPPLY),
    Number(process.env.VIRTUAL_RESERVES),

    // test metadata
    TEST_NAME,
    TEST_SYMBOL,
    TEST_URI,

    payer.publicKey,

    solConnection,
    program
  );

  await execTx(tx, solConnection, payer);
};

export const swap = async (
  token: PublicKey,

  amount: number,
  style: number,
  slippageBps: number = 100 // 1% default slippage
) => {
  const tx = await swapTx(
    payer.publicKey,
    token,
    amount,
    style,
    slippageBps,
    solConnection,
    program
  );

  await execTx(tx, solConnection, payer);
};

export const withdraw = async (token: PublicKey) => {
  const tx = await withdrawTx(
    payer.publicKey,
    token,
    solConnection,
    program
  );

  await execWithdrawTx(tx, solConnection, payer);
};