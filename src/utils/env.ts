import { z } from "zod";

const isDevnet = import.meta.env.VITE_SOLANA_NETWORK === "devnet";

console.log("isDevnet", isDevnet);
console.log(
  "import.meta.env.VITE_SOLANA_NETWORK",
  import.meta.env.VITE_SOLANA_NETWORK,
);
console.log(
  "import.meta.env.VITE_DEVNET_RPC_URL",
  import.meta.env.VITE_DEVNET_RPC_URL,
);
console.log(
  "import.meta.env.VITE_MAINNET_RPC_URL",
  import.meta.env.VITE_MAINNET_RPC_URL,
);
console.log("import.meta.env.VITE_API_URL", import.meta.env.VITE_API_URL);
console.log(
  "import.meta.env.VITE_DEV_API_URL",
  import.meta.env.VITE_DEV_API_URL,
);
console.log(
  "import.meta.env.VITE_VIRTUAL_RESERVES",
  import.meta.env.VITE_VIRTUAL_RESERVES,
);
console.log(
  "import.meta.env.VITE_TOKEN_SUPPLY",
  import.meta.env.VITE_TOKEN_SUPPLY,
);
console.log("import.meta.env.VITE_DECIMALS", import.meta.env.VITE_DECIMALS);
console.log(
  "import.meta.env.VITE_DEV_ADDRESS",
  import.meta.env.VITE_DEV_ADDRESS,
);

const unparsedEnv = {
  rpcUrl:
    (import.meta.env.VITE_SOLANA_NETWORK === "devnet"
      ? import.meta.env.VITE_DEVNET_RPC_URL
      : import.meta.env.VITE_MAINNET_RPC_URL) || import.meta.env.VITE_RPC_URL,
  rpcUrlMainnet: import.meta.env.VITE_MAINNET_RPC_URL,
  virtualReserves: import.meta.env.VITE_VIRTUAL_RESERVES,
  tokenSupply: import.meta.env.VITE_TOKEN_SUPPLY,
  decimals: import.meta.env.VITE_DECIMALS,
  solanaNetwork: import.meta.env.VITE_SOLANA_NETWORK,
  apiUrl: isDevnet
    ? import.meta.env.VITE_DEV_API_URL || import.meta.env.VITE_API_URL
    : import.meta.env.VITE_API_URL,
  devAddress: import.meta.env.VITE_DEV_ADDRESS,
  appEnv: process.env.NODE_ENV,
  r2PublicUrl:
    import.meta.env.R2_PUBLIC_URL ||
    "https://pub-30f52db29266428495af0c1aea206af1.r2.dev",
} as const;

const envSchema = z.object({
  solanaNetwork: z.string().min(1),
  rpcUrl: z.string().min(1),
  rpcUrlMainnet: z.string().min(1),
  virtualReserves: z.string().min(1),
  tokenSupply: z.string().min(1),
  decimals: z.string().min(1),
  apiUrl: z.string().min(1),
  devAddress: z.string().min(1),
  appEnv: z.enum(["development", "production"]),
  r2PublicUrl: z.string().min(1),
});

const parsedEnv = envSchema.parse(unparsedEnv);

export const env = {
  ...parsedEnv,
  getWalletUrl: (address: string) =>
    `https://solscan.io/address/${address}?cluster=${parsedEnv.solanaNetwork}`,
  getTransactionUrl: (txId: string) =>
    `https://solscan.io/tx/${txId}?cluster=${parsedEnv.solanaNetwork}`,
  getHolderURL: (tokenAddress: string) =>
    `https://solscan.io/token/${tokenAddress}#holders?cluster=${parsedEnv.solanaNetwork}`,
  getAccountUrl: (address: string) =>
    `https://solscan.io/account/${address}?cluster=${parsedEnv.solanaNetwork}`,
  getTradesURL: (tokenAddress: string) =>
    `https://solscan.io/token/${tokenAddress}#trades?cluster=${parsedEnv.solanaNetwork}`,
  getTokenURL: (tokenAddress: string) =>
    `https://solscan.io/token/${tokenAddress}?cluster=${parsedEnv.solanaNetwork}`,
};

console.log("env", env);
