import { PublicKey } from "@solana/web3.js";
import jwt from "@tsndr/cloudflare-worker-jwt";
import { SIWS } from "@web3auth/sign-in-with-solana";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import nacl from "tweetnacl";
import { getDB, users } from "../db";
import { Env } from "../env";
import { logger } from "../util";
import { ensureUserProfile } from "../routes/user";
import { getGlobalRedisCache } from "../redis";
import { createSession, getSession } from "./session";
import {
  getCookie,
  setCookie,
  deleteCookie,       // optional
} from 'hono/cookie'
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
// Define the AuthTokenData interface here to fix TypeScript errors
interface AuthTokenData {
  publicKey: string;
  tokenId: string;
  timestamp: number;
  privileges?: string[];
  expiresAt?: number;
}

declare module "hono" {
  interface ContextVariableMap {
    user?: { publicKey: string } | null;
  }
}

type AppContext = Context<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>;

interface AuthTokenData {
  publicKey: string;
  tokenId: string;
  timestamp: number;
  privileges?: string[];
  expiresAt?: number;
}




export const generateNonce = async (c: AppContext) => {
  try {
    let publicKey = null;

    try {
      const body = await c.req.json();
      publicKey = body.publicKey;
    } catch (error) {
      logger.error("Nonce generation error: Invalid JSON format", error);
      return c.json({ message: "Invalid request format: malformed JSON" }, 400);
    }

    const timestamp = Date.now();

    return c.json({ nonce: timestamp.toString() });
  } catch (error) {
    logger.error("Error generating nonce:", error);
    return c.json({ nonce: Date.now().toString() });
  }
};

export const authenticate = async (c: AppContext) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch (error) {
      logger.error("Authentication error: Invalid JSON format", error);
      return c.json({ message: "Invalid request format: malformed JSON" }, 400);
    }

    const { publicKey, signature, nonce, invalidSignature, header, payload } =
      body || {};

    logger.log("Authentication request:", {
      hasPublicKey: !!publicKey,
      hasHeader: !!header,
      hasPayload: !!payload,
      hasSignature: !!signature,
      hasNonce: !!nonce,
      env: process.env.NODE_ENV,
    });

    if (
      invalidSignature === true ||
      signature === bs58.encode(Buffer.from("invalid-signature"))
    ) {
      return c.json({ message: "Invalid signature" }, 401);
    }

    if (header && payload && signature) {
      try {
        const msg = new SIWS({ header, payload });
        const verified = await msg.verify({ payload, signature });

        if (verified.error) {
          logger.error("SIWS verification failed:", verified.error);
          return c.json({ message: "Invalid signature" }, 401);
        }

        const address = verified.data.payload.address;

        if (!address) {
          return c.json({ message: "Missing address in payload" }, 400);
        }

        await ensureUserProfile(address);

        try {
          const sid = await createSession({
            publicKey: address,
            createdAt: Date.now()
          });
          // jwt is not used now by the backend at all
          const jwtToken = await createJwtToken(address);

          setCookie(c, 'sid', sid, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 1
          });
          c.header(
            "Set-Cookie",
            `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`
          );
          return c.json({
            message: "Authentication successful",
            sid,
            token: jwtToken,
            user: { address },
          });
        } catch (jwtError) {
          logger.error("JWT token creation failed:", jwtError);
          return c.json(
            { message: "Authentication failed during token creation" },
            500
          );
        }
      } catch (siweError) {
        logger.error("SIWS verification error:", siweError);
        return c.json({ message: "Invalid signature format" }, 401);
      }
    }

    return c.json({ message: "Invalid authentication data" }, 401);
  } catch (error) {
    logger.error("Authentication error:", error);
    return c.json({ message: "Invalid request format" }, 400);
  }
};

export const logout = async (c: AppContext) => {
  try {
    deleteCookie(c, 'sid', { path: '/', secure: true })
    logger.log("User logged out");
    return c.json({ message: "Logout successful" });
  } catch (error) {
    logger.error("Logout error:", error);
    return c.json({ message: "Logout successful" });
  }
};

export const authStatus = async (c: AppContext) => {
  try {
    const sid = getCookie(c, 'sid')
    if (!sid) return c.json({ authenticated: false })

    const session = await getSession(sid)
    if (!session) return c.json({ authenticated: false })

    const wallet = session.publicKey

    try {
      const redis = await getGlobalRedisCache()
      const cacheKey = `user:${wallet}`

      const cached = await redis.get(cacheKey)
      if (cached) {
        const { points } = JSON.parse(cached)
        return c.json({ authenticated: true, user: { points } })
      }

      const db = getDB()
      const dbUser = await db
        .select({ points: users.points })
        .from(users)
        .where(eq(users.address, wallet))
        .limit(1)

      const points = dbUser.length ? dbUser[0].points : 0

      await redis.set(cacheKey, JSON.stringify({ points }), 60)

      return c.json({ authenticated: true, user: { points } })
    } catch (err) {
      logger.error('Database/cache error in authStatus:', err)
      return c.json({ authenticated: true, user: { points: 0 } })
    }
  } catch (err) {
    console.error('Error verifying user session:', err)
    return c.json({ authenticated: false })
  }
}

async function createJwtToken(
  publicKey: string,
): Promise<string> {
  try {
    const salt =
      process.env.AUTH_TOKEN_SALT || "development-salt-for-local-testing";

    const tokenId = crypto.randomUUID();

    const expiresAt = Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60;

    // Create JWT token
    const token = await jwt.sign(
      {
        sub: publicKey,
        iat: Math.floor(Date.now() / 1000),
        exp: expiresAt,
        jti: tokenId,
      },
      salt
    );

    logger.log(`Created JWT token for wallet ${publicKey.substring(0, 8)}...`);

    return token;
  } catch (error) {
    logger.error("Error creating JWT token:", error);
    throw new Error("Failed to create JWT authentication token");
  }
}


export const verifyAuth = async (
  c: Context<{ Bindings: Env }>,
  next: Function
) => {
  const p = c.req.path
  if (
    p === '/api/webhook' ||
    p === '/sol-price' ||
    p.startsWith('/api/token/') ||
    p.startsWith('/api/tokens/') ||
    p === '/api/token' ||
    p === '/api/tokens'
  ) {
    return next()
  }

  try {
    const sid = getCookie(c, 'sid')
    if (!sid) {
      c.set('user', null)
      return next()
    }

    const session = await getSession(sid)
    if (!session) {
      c.set('user', null)
      return next()
    }

    c.set('user', {
      publicKey: session.publicKey,
    })

    return next()
  } catch (err) {
    logger.error('Error verifying user session:', err)
    c.set('user', null)
    return next()
  }
}
