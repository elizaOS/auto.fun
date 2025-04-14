import { z } from "zod";

const unparsedEnv = {
  contractApiUrl: process.env.NEXT_PUBLIC_CONTRACT_API_URL,
  solscanCluster: process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER,
  bondingCurveAddress: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS,
  devAddress: process.env.NEXT_PUBLIC_DEV_ADDRESS,
  raydiumAddress: process.env.NEXT_PUBLIC_RAYDIUM_ADDRESS,
  rpcUrl:
    process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet"
      ? process.env.NEXT_PUBLIC_DEVNET_RPC_URL
      : process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  virtualReserves: process.env.NEXT_PUBLIC_VIRTUAL_RESERVES,
  tokenSupply: process.env.NEXT_PUBLIC_TOKEN_SUPPLY,
  decimals: process.env.NEXT_PUBLIC_DECIMALS,
} as const;

const envSchema = z.object({
  contractApiUrl: z.string().min(1),
  solscanCluster: z.string().min(1),
  bondingCurveAddress: z.string().min(1),
  devAddress: z.string().min(1),
  raydiumAddress: z.string().min(1),
  rpcUrl: z.string().min(1),
  virtualReserves: z.string().min(1),
  tokenSupply: z.string().min(1),
  decimals: z.string().min(1),
});

const parsedEnv = envSchema.parse(unparsedEnv);

export const env = {
  ...parsedEnv,
  getWalletUrl: (address: string) =>
    `https://solscan.io/address/${address}?cluster=${parsedEnv.solscanCluster}`,
  getTransactionUrl: (txId: string) =>
    `https://solscan.io/tx/${txId}?cluster=${parsedEnv.solscanCluster}`,
};
