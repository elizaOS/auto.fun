import { Connection, Keypair } from "@solana/web3.js";
import { getRpcUrl } from "./util";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
  AnchorProvider,
  Program,
  setProvider,
  workspace,
} from "@coral-xyz/anchor";
import { Autofun } from "../target/types/autofun";

const getSolanaConnection = () => {
  return new Connection(getRpcUrl());
};

const getUmi = () => {
  return createUmi(getRpcUrl()).use(mplTokenMetadata());
};

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
  { skipValidation: true }
);

const wallet = new NodeWallet(walletKeypair);

const getProgram = () => {
  const connection = getSolanaConnection();
  const provider = new AnchorProvider(connection, wallet, {
    skipPreflight: true,
    commitment: "confirmed",
  });
  setProvider(provider);

  return workspace.Autofun as Program<Autofun>;
};

export const config = {
  connection: getSolanaConnection(),
  program: getProgram(),
  umi: getUmi(),
  wallet,
};
