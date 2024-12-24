import { z } from "zod";

const unparsedEnv = {
  contractApiUrl: process.env.NEXT_PUBLIC_CONTRACT_API_URL,
  solscanCluster: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
  bondingCurveAddress: process.env.NEXT_PUBLIC_BONDING_CURVE_ADDRESS,
  devAddress: process.env.NEXT_PUBLIC_DEV_ADDRESS,
  raydiumAddress: process.env.NEXT_PUBLIC_RAYDIUM_ADDRESS,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
} as const;

const envSchema = z.object({
  contractApiUrl: z.string().min(1),
  solscanCluster: z.string().min(1),
  bondingCurveAddress: z.string().min(1),
  devAddress: z.string().min(1),
  raydiumAddress: z.string().min(1),
  rpcUrl: z.string().min(1),
});

const parsedEnv = envSchema.parse(unparsedEnv);

export const env = {
  ...parsedEnv,
  getWalletUrl: (address: string) =>
    `https://solscan.io/address/${address}?cluster=${parsedEnv.solscanCluster}`,
  getTransactionUrl: (txId: string) =>
    `https://solscan.io/tx/${txId}?cluster=${parsedEnv.solscanCluster}`,
};
