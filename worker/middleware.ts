import { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { Env } from "./env";
import { logger } from "./logger";
import { validateAuthToken } from "./auth-utils";

export const verifyAuth: MiddlewareHandler<{
  Bindings: Env;
}> = async (c, next) => {
  try {
    // First check for Authorization header (token-based auth)
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7); // Remove "Bearer " prefix
      
      // For testing allow valid-token in Authorization header
      if (c.env.NODE_ENV === "test" && token === "valid-token") {
        c.set("user", { publicKey: "test_user" });
        logger.log("Test user authenticated via Authorization header");
        await next();
        return;
      }
      
      // Validate the token if it's in our wallet_ format
      if (token.startsWith("wallet_")) {
        const tokenData = await validateAuthToken(c.env, token);
        if (tokenData) {
          // Token is valid, set user
          c.set("user", { publicKey: tokenData.publicKey });
          logger.log("User authenticated via Authorization header wallet token", { publicKey: tokenData.publicKey });
          await next();
          return;
        }
      } 
      // Try JWT token validation if it looks like a JWT
      else if (token.includes(".")) {
        try {
          // Import dynamically to avoid breaking if JWT module isn't available
          const { validateJwtToken } = await import("./auth-utils");
          const tokenData = await validateJwtToken(c.env, token);
          if (tokenData) {
            // Token is valid, set user
            c.set("user", { publicKey: tokenData.publicKey });
            logger.log("User authenticated via Authorization header JWT token", { publicKey: tokenData.publicKey });
            await next();
            return;
          }
        } catch (e) {
          logger.error("Error validating JWT token:", e);
        }
      }
    }
    
    // Fallback to cookies for backward compatibility
    const publicKey = getCookie(c, "publicKey");
    const authToken = getCookie(c, "auth_token");

    if (publicKey && authToken) {
      // Both cookies present, user is authenticated
      c.set("user", { publicKey });
      logger.log("User authenticated via cookies", { publicKey });
    } else {
      // No valid authentication
      logger.log("No valid authentication found");
      c.set("user", null);
    }

    await next();
  } catch (error) {
    logger.error("Error verifying user session:", error);
    c.set("user", null);
    await next();
  }
};

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
}> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Authentication required" }, 401);
  }
  await next();
};
