// Define allowed origins
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: "../../.env" });

console.log("ALLOWED_ORIGINS", process.env.ALLOWED_ORIGINS);

// Get allowed origins from environment variable if available
// Format: comma-separated list of domains
const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : null;

export const allowedOrigins = envAllowedOrigins || ["http://localhost:3000"];
