import { z } from "zod";

export const isDevnet = import.meta.env.VITE_SOLANA_NETWORK === "devnet";

if (isDevnet) {
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
    "import.meta.env.VITE_DEV_PROGRAM_ID",
    import.meta.env.VITE_DEV_PROGRAM_ID,
  );
}

const unparsedEnv = {
  rpcUrl:
    (import.meta.env.VITE_SOLANA_NETWORK === "devnet"
      ? import.meta.env.VITE_DEVNET_RPC_URL
      : import.meta.env.VITE_MAINNET_RPC_URL) || import.meta.env.VITE_RPC_URL,
  rpcUrlMainnet: import.meta.env.VITE_MAINNET_RPC_URL,
  virtualReserves: import.meta.env.VITE_VIRTUAL_RESERVES,
  finalTokenPrice:
    import.meta.env.VITE_FINAL_TOKEN_PRICE || "4.5100194181788156e-8",
  tokenSupply: import.meta.env.VITE_TOKEN_SUPPLY,
  feeVault: import.meta.env.VITE_FEE_VAULT,
  decimals: import.meta.env.VITE_DECIMALS,
  solanaNetwork: import.meta.env.VITE_SOLANA_NETWORK,
  apiUrl: isDevnet
    ? import.meta.env.VITE_DEV_API_URL || import.meta.env.VITE_API_URL
    : import.meta.env.VITE_API_URL,
  programId: isDevnet
    ? import.meta.env.VITE_DEV_PROGRAM_ID ||
      "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5"
    : import.meta.env.VITE_PROGRAM_ID ||
      "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
  appEnv: process.env.NODE_ENV,
  s3PublicUrl:
    import.meta.env.VITE_R2_PUBLIC_URL || import.meta.env.VITE_S3_PUBLIC_URL,
} as const;

const envSchema = z.object({
  solanaNetwork: z.string().min(1),
  rpcUrl: z.string().min(1),
  rpcUrlMainnet: z.string().min(1),
  virtualReserves: z.string().min(1),
  finalTokenPrice: z.string().min(1),
  tokenSupply: z.string().min(1),
  decimals: z.string().min(1),
  apiUrl: z.string().min(1),
  programId: z.string().min(1),
  feeVault: z.string().min(1),
  appEnv: z.enum(["development", "production"]),
  s3PublicUrl: z.string().min(1),
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
  getRaydiumURL: (tokenAddress: string) =>
    `https://www.raydium.io/swap?inputMint=sol&outputMint=${tokenAddress}`,
};
