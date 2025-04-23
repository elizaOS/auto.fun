import {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

type Cluster = "mainnet" | "devnet";
export const getRpcUrl = () => {
  const env = process.env;
  return process.env.NETWORK === "devnet"
    ? process.env.DEVNET_SOLANA_RPC_URL!
    : process.env.MAINNET_SOLANA_RPC_URL!;
};

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;
export const initSdk = async (params: {
  loadToken?: boolean;
  owner?: PublicKey;
}) => {
  const cluster = process.env.NETWORK as Cluster;
  const connection = new Connection(getRpcUrl());
  const owner: Keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY!)),
  );

  if (raydium) return raydium;
  console.log(
    `Raydium SDK: Connected to RPC ${connection.rpcEndpoint} in ${cluster}`,
  );
  raydium = await Raydium.load({
    owner: params?.owner || owner as any,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: "finalized",
  });

  return raydium;
};

export const fetchTokenAccountData = async () => {
  const env = process.env;
  const connection = new Connection(getRpcUrl());
  const owner: Keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY!)),
  );
  const solAccountResp = await connection.getAccountInfo(owner.publicKey);
  const tokenAccountResp = await connection.getTokenAccountsByOwner(
    owner.publicKey,
    { programId: TOKEN_PROGRAM_ID },
  );
  const token2022Req = await connection.getTokenAccountsByOwner(
    owner.publicKey,
    { programId: TOKEN_2022_PROGRAM_ID },
  );
  const tokenAccountData = parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  });
  return tokenAccountData;
};
