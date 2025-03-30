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
      process.env.NODE_ENV === "production"
        ? process.env.VITE_API_URL || "http://localhost:8787"
        : process.env.VITE_DEV_API_URL ||
            process.env.VITE_API_URL ||
            "http://localhost:8787"
    ),
    "import.meta.env.APP_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
    "import.meta.env.VITE_TOKEN_SUPPLY": JSON.stringify(
      process.env.VITE_TOKEN_SUPPLY || "100000000000000"
    ),
    "import.meta.env.VITE_DECIMALS": JSON.stringify(
      process.env.VITE_DECIMALS || "6"
    ),
    "import.meta.env.VITE_VIRTUAL_RESERVES": JSON.stringify(
      process.env.VITE_VIRTUAL_RESERVES || "2800000000"
    ),
    "import.meta.env.VITE_SOLANA_NETWORK": JSON.stringify(
      process.env.VITE_SOLANA_NETWORK || "mainnet"
    ),
    "import.meta.env.VITE_SOLANA_RPC_URL": JSON.stringify(
      (process.env.VITE_SOLANA_NETWORK === "mainnet" ? process.env.VITE_MAINNET_RPC_URL : process.env.VITE_DEVNET_RPC_URL) || process.env.VITE_SOLANA_RPC_URL
    ),
    "import.meta.env.VITE_DEVNET_RPC_URL": JSON.stringify(
      process.env.VITE_DEVNET_RPC_URL || "https://api.devnet.solana.com"
    ),
    "import.meta.env.VITE_MAINNET_RPC_URL": JSON.stringify(
      process.env.VITE_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com"
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
