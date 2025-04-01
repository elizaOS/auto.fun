import { z } from "zod";

const isDevnet = import.meta.env.VITE_SOLANA_NETWORK === "devnet";

const unparsedEnv = {
  rpcUrl:
    (import.meta.env.VITE_SOLANA_NETWORK === "devnet"
      ? import.meta.env.VITE_DEVNET_RPC_URL
      : import.meta.env.VITE_MAINNET_RPC_URL) || import.meta.env.VITE_RPC_URL,
  virtualReserves: import.meta.env.VITE_VIRTUAL_RESERVES,
  tokenSupply: import.meta.env.VITE_TOKEN_SUPPLY,
  decimals: import.meta.env.VITE_DECIMALS,
  solanaNetwork: import.meta.env.VITE_SOLANA_NETWORK,
  apiUrl: isDevnet
    ? import.meta.env.VITE_DEV_API_URL ||
      import.meta.env.VITE_API_URL ||
      "https://api-dev.autofun.workers.dev"
    : import.meta.env.VITE_API_URL || "https://api.autofun.workers.dev",
  devAddress: import.meta.env.VITE_DEV_ADDRESS,
  appEnv: process.env.NODE_ENV,
} as const;

const envSchema = z.object({
  solanaNetwork: z.string().min(1),
  rpcUrl: z.string().min(1),
  virtualReserves: z.string().min(1),
  tokenSupply: z.string().min(1),
  decimals: z.string().min(1),
  apiUrl: z.string().min(1),
  devAddress: z.string().min(1),
  appEnv: z.enum(["development", "production"]),
});

const parsedEnv = envSchema.parse(unparsedEnv);

export const env = {
  ...parsedEnv,
  getWalletUrl: (address: string) =>
    `https://solscan.io/address/${address}?cluster=${parsedEnv.solanaNetwork}`,
  getTransactionUrl: (txId: string) =>
    `https://solscan.io/tx/${txId}?cluster=${parsedEnv.solanaNetwork}`,
};


console.log("env", env);