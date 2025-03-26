import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteCompression from "vite-plugin-compression";
import preact from "@preact/preset-vite";
/** @ts-ignore */
import { fileURLToPath, URL } from "url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact(), tailwindcss(), viteCompression()],
  server: {
    watch: {
      usePolling: true,
    },
    port: 3000,
  },
  resolve: {
    alias: {
      "@/libraries": fileURLToPath(new URL("./public/libraries", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    // Define environment variables that will be replaced at build time
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.NODE_ENV === "production" 
      ? (process.env.VITE_API_URL || "http://localhost:8787") 
      : (process.env.VITE_DEV_API_URL || process.env.VITE_API_URL || "http://localhost:8787")
    ),
    "import.meta.env.APP_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
});
