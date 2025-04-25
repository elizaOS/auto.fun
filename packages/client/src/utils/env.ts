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
  console.log(
    "import.meta.env.VITE_METADATA_BASE_URL",
    import.meta.env.VITE_METADATA_BASE_URL,
  );
  console.log(
    "import.meta.env.VITE_IMAGE_OPTIMIZATION_URL",
    import.meta.env.VITE_IMAGE_OPTIMIZATION_URL,
  );
  console.log(
    "import.meta.env.VITE_ADMIN_ADDRESSES",
    import.meta.env.VITE_ADMIN_ADDRESSES,
  );
}

// Parse admin addresses from comma-separated string to array
const parseAdminAddresses = (addressesStr: string | undefined): string[] => {
  if (!addressesStr) return [];
  return addressesStr.split(",").map((addr) => addr.trim());
};

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
  platformFeeWallet: import.meta.env.VITE_FEE_WALLET,
  platformFeeTokenAccount: import.meta.env.VITE_FEE_TOKEN_ACCOUNT || undefined,
  programId: isDevnet
    ? import.meta.env.VITE_DEV_PROGRAM_ID ||
      "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5"
    : import.meta.env.VITE_PROGRAM_ID ||
      "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
  appEnv: process.env.NODE_ENV,
  s3PublicUrl:
    import.meta.env.VITE_S3_PUBLIC_URL ||
    import.meta.env.VITE_R2_PUBLIC_URL ||
    import.meta.env.VITE_MINIO_PUBLIC_URL,
  metadataBaseUrl: import.meta.env.VITE_METADATA_BASE_URL,
  imageOptimizationUrl: import.meta.env.VITE_IMAGE_OPTIMIZATION_URL,
  exampleImageUrl: import.meta.env.VITE_EXAMPLE_IMAGE_URL,
  adminAddresses:
    parseAdminAddresses(import.meta.env.VITE_ADMIN_ADDRESSES) || [],
} as const;

const envSchema = z.object({
  solanaNetwork: z.string().min(1),
  rpcUrl: z.string().min(1),
  rpcUrlMainnet: z.string().min(1),
  virtualReserves: z.string().min(1),
  tokenSupply: z.string().min(1),
  decimals: z.string().min(1),
  apiUrl: z.string().min(1),
  platformFeeWallet: z.string().min(1),
  platformFeeTokenAccount: z.string().min(1).optional(),
  programId: z.string().min(1),
  appEnv: z.enum(["development", "production"]),
  s3PublicUrl: z.string().min(1),
  metadataBaseUrl: z.string().min(1),
  imageOptimizationUrl: z.string().min(1),
  exampleImageUrl: z.string().min(1),
  adminAddresses: z.array(z.string()),
});

let parsedEnv;

try {
  parsedEnv = envSchema.parse(unparsedEnv);
} catch (error) {
  console.error("ENV VALIDATION ERROR:", error);
  throw error;
}

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
  getMetadataUrl: (tokenMint: string) =>
    `${parsedEnv.metadataBaseUrl}/${tokenMint}.json`,
};
