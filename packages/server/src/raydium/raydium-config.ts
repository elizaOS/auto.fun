import {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Env } from "../env";
import { logger } from "../util";

type Cluster = "mainnet" | "devnet";
export const getRpcUrl = (env: Env) => {
  return env.NETWORK === "devnet"
    ? env.DEVNET_SOLANA_RPC_URL!
    : env.MAINNET_SOLANA_RPC_URL!;
};

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;
export const initSdk = async (params: {
  env: Env;
  loadToken?: boolean;
  owner?: PublicKey;
}) => {
  const cluster = params.env.NETWORK as Cluster;
  const connection = new Connection(getRpcUrl(params.env));
  const owner: Keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(params.env.WALLET_PRIVATE_KEY!)),
  );

  if (raydium) return raydium;
  logger.log(
    `Raydium SDK: Connected to RPC ${connection.rpcEndpoint} in ${cluster}`,
  );
  raydium = await Raydium.load({
    owner: params?.owner || owner,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: "finalized",
  });

  return raydium;
};

export const fetchTokenAccountData = async (env: Env) => {
  const connection = new Connection(getRpcUrl(env));
  const owner: Keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY!)),
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
