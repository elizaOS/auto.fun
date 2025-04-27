import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath, URL } from "url";
import Sitemap from "vite-plugin-sitemap";

import { config } from "dotenv";

config({
  path: "../../.env",
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
  // Explicitly include node built-ins for browser compatibility
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
});
