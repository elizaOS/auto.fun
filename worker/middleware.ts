import { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { Env } from "./env";
import { logger } from "./logger";

export const verifyAuth: MiddlewareHandler<{
  Bindings: Env;
}> = async (c, next) => {
  try {
    const publicKey = getCookie(c, "publicKey");
    const authToken = getCookie(c, "auth_token");

    if (publicKey && authToken) {
      // Both cookies present, user is authenticated
      c.set("user", { publicKey });
      logger.log("User authenticated via cookies", { publicKey });
    } else {
      // No valid authentication for production
      logger.log("No authentication cookie found");
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
