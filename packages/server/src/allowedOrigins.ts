const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : null;

console.log("envAllowedOrigins", envAllowedOrigins);

export const allowedOrigins = envAllowedOrigins || ["http://localhost:3000"];

