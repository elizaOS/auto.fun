import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import preact from "@preact/preset-vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
/** @ts-ignore */
import { fileURLToPath, URL } from "url";
import Sitemap from 'vite-plugin-sitemap'

import { config } from "dotenv";

config();

// Helper to determine if we're using devnet (default to true for development)
const isDevnet = (process.env.VITE_SOLANA_NETWORK || "devnet") === "devnet";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    viteCompression({
      verbose: true,
      disable: false,
      algorithm: "brotliCompress",
      ext: ".br",
    }),
    Sitemap(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
      // Whether to include the Buffer polyfill
      include: ["buffer", "process"],
    }),
  ],
  server: {
    watch: {
      usePolling: true,
    },
    port: 3000,
  },
  resolve: {
    alias: {
      "@/libraries": fileURLToPath(
        new URL("./public/libraries", import.meta.url)
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(
      isDevnet
        ? (process.env.VITE_DEV_API_URL || process.env.VITE_API_URL || "https://api-dev.autofun.workers.dev")
        :  (process.env.VITE_API_URL || "https://api.autofun.workers.dev")
    ),
    "import.meta.env.APP_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
    "import.meta.env.VITE_SOLANA_NETWORK": JSON.stringify(
      process.env.VITE_SOLANA_NETWORK || "devnet"
    ),
    "import.meta.env.VITE_DEVNET_RPC_URL": JSON.stringify(
      process.env.VITE_DEVNET_RPC_URL || "https://devnet.helius-rpc.com/?api-key=7f068738-8b88-4a91-b2a9-99b00f716717"
    ),
    "import.meta.env.VITE_MAINNET_RPC_URL": JSON.stringify(
      process.env.VITE_MAINNET_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=7f068738-8b88-4a91-b2a9-99b00f716717"
    ),
    "import.meta.env.VITE_RPC_URL": JSON.stringify(
      process.env.VITE_RPC_URL || 
      (isDevnet 
        ? process.env.VITE_DEVNET_RPC_URL || "https://devnet.helius-rpc.com/?api-key=7f068738-8b88-4a91-b2a9-99b00f716717"
        : process.env.VITE_MAINNET_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=7f068738-8b88-4a91-b2a9-99b00f716717")
    ),
    "import.meta.env.VITE_VIRTUAL_RESERVES": JSON.stringify(
      process.env.VITE_VIRTUAL_RESERVES || (isDevnet ? "280000000" : "2800000000")
    ),
    "import.meta.env.VITE_TOKEN_SUPPLY": JSON.stringify(
      process.env.VITE_TOKEN_SUPPLY || (isDevnet ? "100000000000000" : "1000000000000000")
    ),
    "import.meta.env.VITE_DECIMALS": JSON.stringify(
      process.env.VITE_DECIMALS || "6"
    ),
    "import.meta.env.VITE_BONDING_CURVE_ADDRESS": JSON.stringify(
      process.env.VITE_BONDING_CURVE_ADDRESS || "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x"
    ),
    "import.meta.env.VITE_DEV_ADDRESS": JSON.stringify(
      process.env.VITE_DEV_ADDRESS || "6X498a5ujz5zZ5d5LJXqdR28dzDgmLisaAL6Qdq18N9p"
    ),
    "import.meta.env.VITE_RAYDIUM_ADDRESS": JSON.stringify(
      process.env.VITE_RAYDIUM_ADDRESS || "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL"
    ),
    global: "window",
  },
  // Explicitly include node built-ins for browser compatibility
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
});
