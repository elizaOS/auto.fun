import { Env } from "./env";
import { logger } from "./logger";
import crypto from "crypto";
import jwt from "@tsndr/cloudflare-worker-jwt";

interface AuthTokenData {
  publicKey: string;
  tokenId: string;
  timestamp: number;
  privileges?: string[];
  expiresAt?: number;
}

// Check if we're in a development environment using Miniflare
const isLocalDev =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

/**
 * Generates a secure hash for the provided input using the salt from environment
 */
export function hashWithSalt(input: string, salt: string): string {
  return crypto.createHash("sha256").update(`${input}${salt}`).digest("hex");
}

/**
 * Creates a token ID that can be used for lookup
 */
export function generateTokenId(publicKey: string): string {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  return `${randomBytes}_${Date.now()}`;
}

/**
 * Generates the KV key for a wallet's tokens
 */
export function generateWalletKey(publicKey: string, salt: string): string {
  return `wallet:${hashWithSalt(publicKey, salt)}`;
}

/**
 * Generates the KV key for a specific token
 */
export function generateTokenKey(tokenId: string, salt: string): string {
  return `token:${hashWithSalt(tokenId, salt)}`;
}

/**
 * Creates and stores an auth token for a wallet
 */
export async function createAuthToken(
  env: Env,
  publicKey: string,
  privileges: string[] = [],
): Promise<string> {
  try {
    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";

    // Generate a unique token ID
    const tokenId = generateTokenId(publicKey);

    // Create the token data structure
    const tokenData: AuthTokenData = {
      publicKey,
      tokenId,
      timestamp: Date.now(),
      privileges,
      // Token expires in 7 days
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    // Generate the wallet and token keys
    const walletKey = generateWalletKey(publicKey, salt);
    const tokenKey = generateTokenKey(tokenId, salt);

    try {
      // Store the token in KV
      if (env.AUTH_TOKENS) {
        await env.AUTH_TOKENS.put(tokenKey, JSON.stringify(tokenData));

        // Add this token to the wallet's token list
        // First, get the existing tokens for this wallet
        let walletTokens: string[] = [];
        try {
          const existingTokensStr = await env.AUTH_TOKENS.get(walletKey);
          if (existingTokensStr) {
            walletTokens = JSON.parse(existingTokensStr);
          }
        } catch (error) {
          logger.error("Error getting existing wallet tokens:", error);
        }

        // Add the new token and update the wallet's token list
        walletTokens.push(tokenId);
        await env.AUTH_TOKENS.put(walletKey, JSON.stringify(walletTokens));
      } else {
        logger.warn(
          "AUTH_TOKENS KV namespace not available - token not stored persistently",
        );
      }
    } catch (kvError) {
      // Log KV errors but don't fail the token creation
      logger.error(
        "KV operation failed, proceeding with token creation:",
        kvError,
      );
    }

    logger.log(`Created auth token for wallet ${publicKey.substring(0, 8)}...`);

    // Return the client-friendly token format: wallet_publicKey_tokenId
    return `wallet_${publicKey}_${tokenId}`;
  } catch (error) {
    logger.error("Error creating auth token:", error);
    throw new Error("Failed to create authentication token");
  }
}

/**
 * Validates an auth token and returns the token data if valid
 */
export async function validateAuthToken(
  env: Env,
  token: string,
): Promise<AuthTokenData | null> {
  try {
    // Parse the token format: wallet_publicKey_tokenId
    const tokenParts = token.split("_");
    if (tokenParts.length < 3 || tokenParts[0] !== "wallet") {
      logger.error("Invalid token format");
      return null;
    }

    const publicKey = tokenParts[1];
    const tokenId = tokenParts.slice(2).join("_"); // Handle tokenIds that might contain underscores

    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";
    const tokenKey = generateTokenKey(tokenId, salt);

    // For development or if KV is not available, construct a valid token
    if (!env.AUTH_TOKENS) {
      logger.warn(
        "AUTH_TOKENS KV namespace not available - using token parts directly",
      );
      // Construct a mock token data for development
      const mockTokenData: AuthTokenData = {
        publicKey,
        tokenId,
        timestamp: Date.now() - 1000, // Just a bit in the past
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      return mockTokenData;
    }

    // Get the token data from KV
    try {
      const tokenDataStr = await env.AUTH_TOKENS.get(tokenKey);
      if (!tokenDataStr) {
        logger.error("Token not found in KV store");
        return null;
      }

      // Parse the token data
      const tokenData = JSON.parse(tokenDataStr) as AuthTokenData;

      // Check if the token is expired
      if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
        logger.error("Token has expired");
        return null;
      }

      // Verify the public key matches
      if (tokenData.publicKey !== publicKey) {
        logger.error("Token public key mismatch");
        return null;
      }

      return tokenData;
    } catch (kvError) {
      logger.error("KV operation failed during validation:", kvError);

      // For development, allow token validation to proceed with constructed data
      if (isLocalDev) {
        logger.warn("Using constructed token data for local development");
        return {
          publicKey,
          tokenId,
          timestamp: Date.now() - 1000,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
      }
      return null;
    }
  } catch (error) {
    logger.error("Error validating token:", error);
    return null;
  }
}

/**
 * Revokes all tokens for a wallet
 */
export async function revokeAllWalletTokens(
  env: Env,
  publicKey: string,
): Promise<boolean> {
  try {
    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";
    const walletKey = generateWalletKey(publicKey, salt);

    // If KV is not available, just log and return success
    if (!env.AUTH_TOKENS) {
      logger.warn(
        "AUTH_TOKENS KV namespace not available - revoke operation logged but not performed",
      );
      return true;
    }

    try {
      // Get existing tokens for this wallet
      const existingTokensStr = await env.AUTH_TOKENS.get(walletKey);
      if (!existingTokensStr) {
        // No tokens to revoke
        return true;
      }

      const walletTokens = JSON.parse(existingTokensStr) as string[];

      // Delete each token
      for (const tokenId of walletTokens) {
        const tokenKey = generateTokenKey(tokenId, salt);
        await env.AUTH_TOKENS.delete(tokenKey);
      }

      // Clear the wallet's token list
      await env.AUTH_TOKENS.delete(walletKey);
    } catch (kvError) {
      logger.error("KV operation failed during revocation:", kvError);
      // Don't fail the operation for development
      if (isLocalDev) {
        return true;
      }
    }

    logger.log(`Revoked all tokens for wallet ${publicKey.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error("Error revoking wallet tokens:", error);
    return isLocalDev ? true : false;
  }
}

/**
 * Revokes a specific token
 */
export async function revokeToken(env: Env, token: string): Promise<boolean> {
  try {
    // Parse the token format: wallet_publicKey_tokenId
    const tokenParts = token.split("_");
    if (tokenParts.length < 3 || tokenParts[0] !== "wallet") {
      logger.error("Invalid token format");
      return false;
    }

    const publicKey = tokenParts[1];
    const tokenId = tokenParts.slice(2).join("_");

    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";
    const tokenKey = generateTokenKey(tokenId, salt);
    const walletKey = generateWalletKey(publicKey, salt);

    // If KV is not available, just log and return success for development
    if (!env.AUTH_TOKENS) {
      logger.warn(
        "AUTH_TOKENS KV namespace not available - revoke operation logged but not performed",
      );
      return isLocalDev;
    }

    try {
      // Delete the token
      await env.AUTH_TOKENS.delete(tokenKey);

      // Update the wallet's token list
      const existingTokensStr = await env.AUTH_TOKENS.get(walletKey);
      if (existingTokensStr) {
        const walletTokens = JSON.parse(existingTokensStr) as string[];
        const updatedTokens = walletTokens.filter((id) => id !== tokenId);
        await env.AUTH_TOKENS.put(walletKey, JSON.stringify(updatedTokens));
      }
    } catch (kvError) {
      logger.error("KV operation failed during token revocation:", kvError);
      // Don't fail the operation for development
      if (isLocalDev) {
        return true;
      }
      return false;
    }

    logger.log(`Revoked token for wallet ${publicKey.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error("Error revoking token:", error);
    return isLocalDev ? true : false;
  }
}

// Validate a JWT token
export async function validateJwtToken(
  env: Env,
  token: string,
): Promise<AuthTokenData | null> {
  try {
    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";

    // Verify the JWT token
    const isValid = await jwt.verify(token, salt);

    if (!isValid) {
      logger.error("JWT token verification failed");
      return null;
    }

    // Decode the token to get the payload
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.payload) {
      logger.error("JWT token missing payload");
      return null;
    }

    // Check if the token is expired
    if (
      decoded.payload.exp &&
      decoded.payload.exp < Math.floor(Date.now() / 1000)
    ) {
      logger.error("JWT token has expired");
      return null;
    }

    // Extract the public key from the subject field
    const publicKey = decoded.payload.sub;

    if (!publicKey) {
      logger.error("JWT token missing subject/publicKey");
      return null;
    }

    // Create a type for custom payload with privileges
    interface CustomJwtPayload {
      sub?: string;
      jti?: string;
      iat?: number;
      exp?: number;
      privileges?: string[];
      [key: string]: any;
    }

    // Use the extended payload type
    const payload = decoded.payload as CustomJwtPayload;

    // Convert to our standard AuthTokenData format
    const tokenData: AuthTokenData = {
      publicKey,
      tokenId: payload.jti || `jwt_${Date.now()}`,
      timestamp: payload.iat ? payload.iat * 1000 : Date.now(),
      expiresAt: payload.exp ? payload.exp * 1000 : undefined,
      privileges: payload.privileges || [],
    };

    return tokenData;
  } catch (error) {
    logger.error("Error validating JWT token:", error);
    return null;
  }
}

// Create a JWT token
export async function createJwtToken(
  env: Env,
  publicKey: string,
  privileges: string[] = [],
): Promise<string> {
  try {
    // For development, always use a standard salt if not provided
    const salt = env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";

    // Generate a unique token ID
    const tokenId = generateTokenId(publicKey);

    // Calculate expiration time (7 days from now)
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    // Create JWT token
    const token = await jwt.sign(
      {
        // Standard JWT fields
        sub: publicKey, // Subject = wallet public key
        iat: Math.floor(Date.now() / 1000), // Issued at (seconds)
        exp: expiresAt, // Expiration (seconds)
        jti: tokenId, // JWT ID

        // Custom claims
        privileges, // User privileges
      },
      salt,
    );

    logger.log(`Created JWT token for wallet ${publicKey.substring(0, 8)}...`);

    return token;
  } catch (error) {
    logger.error("Error creating JWT token:", error);
    throw new Error("Failed to create JWT authentication token");
  }
}
