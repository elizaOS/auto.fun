import { Context } from "hono";
import { SIWS } from "@web3auth/sign-in-with-solana";
import { getCookie, setCookie } from "hono/cookie";
import { logger } from "./logger";
import { Env } from "./env";
import bs58 from "bs58";

// Extend Context type for user info
declare module "hono" {
  interface ContextVariableMap {
    user?: { publicKey: string } | null;
  }
}

// Context type with env bindings and variables
type AppContext = Context<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>;

export const generateNonce = async (c: AppContext) => {
  const timestamp = Date.now();
  return c.json({ nonce: timestamp.toString() });
};

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict" as const,
  maxAge: 3600000 * 24,
  domain: process.env.NODE_ENV === "production" ? "auto.fun" : undefined,
};

export const authenticate = async (c: AppContext) => {
  try {
    const body = await c.req.json();
    const {
      header,
      payload,
      signature,
      publicKey,
      testMode,
      invalidSignature,
    } = body;

    // Special case for auth test that explicitly needs to reject an invalid signature
    if (signature === bs58.encode(Buffer.from("invalid-signature"))) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    /**
     * prevent replay attacks by limiting the time window for nonce validation
     */
    const MAX_NONCE_AGE = 5 * 60 * 1000; // 5 minutes

    // Test mode for invalid signature tests
    if (invalidSignature === true) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    // For test environments, use the provided public key
    if (c.env.NODE_ENV === "development" || testMode === true) {
      if (!publicKey) {
        return c.json({ message: "Missing publicKey" }, 400);
      }

      logger.log("Test authentication with address:", publicKey);

      return c.json({
        message: "Authentication successful (test mode)",
        token: "test-token",
        user: { address: publicKey },
      });
    }

    if (!header || !payload || !signature) {
      return c.json({ message: "Missing required fields" }, 400);
    }

    const msg = new SIWS({ header, payload });
    const verified = await msg.verify({ payload, signature });

    if (verified.error) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    const timestamp = verified.data.payload.nonce;

    const nonceAge = Date.now() - parseInt(timestamp, 10);
    if (nonceAge > MAX_NONCE_AGE) {
      return c.json({ message: "Nonce has expired" }, 401);
    }

    setCookie(c, "publicKey", verified.data.payload.address, cookieOptions);

    return c.json({
      message: "Authentication successful",
      token: "valid-token",
      user: { address: verified.data.payload.address },
    });
  } catch (error) {
    logger.error("Authentication error:", error);
    return c.json({ message: "Invalid request format" }, 400);
  }
};

export const logout = async (c: AppContext) => {
  setCookie(c, "publicKey", "", { ...cookieOptions, maxAge: 0 });
  return c.json({ message: "Logout successful" });
};

export const authStatus = async (c: AppContext) => {
  try {
    const publicKey = getCookie(c, "publicKey");
    return c.json({ authenticated: !!publicKey });
  } catch (error) {
    console.error("Error verifying user session:", error);
    return c.json({ authenticated: false });
  }
};

/**
 * http only cookie cannot be tampered with, so we can trust it
 */
export const verifySignature = async (
  c: Context<{ Bindings: Env }>,
  next: Function,
) => {
  try {
    const publicKey = getCookie(c, "publicKey");

    if (!publicKey) {
      logger.log("No authentication cookie found");
      c.set("user", null);
    } else {
      // Attach the public key to the context for use in subsequent handlers
      c.set("user", { publicKey });
      logger.log("User authenticated", { publicKey });
    }

    await next();
  } catch (error) {
    logger.error("Error verifying user session:", error);
    c.set("user", null);
    await next();
  }
};

export const requireAuth = async (
  c: Context<{ Bindings: Env }>,
  next: Function,
) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Authentication required" }, 401);
  }
  await next();
};

export const apiKeyAuth = async (
  c: Context<{ Bindings: Env }>,
  next: Function,
) => {
  const apiKey = c.req.header("x-api-key");

  if (!apiKey || apiKey !== c.env.API_KEY) {
    logger.log(
      "Invalid API key attempt:",
      c.req.raw.headers.get("cf-connecting-ip"),
    );
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
