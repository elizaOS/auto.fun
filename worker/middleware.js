import { getCookie } from 'hono/cookie';
import { logger } from './logger';
export const verifyAuth = async (c, next) => {
    try {
        const publicKey = getCookie(c, 'publicKey');
        if (!publicKey) {
            // logger.log("No authentication cookie found");
            c.set('user', null);
        }
        else {
            // Attach the public key to the context for use in subsequent handlers
            c.set('user', { publicKey });
            logger.log("User authenticated", { publicKey });
        }
        await next();
    }
    catch (error) {
        logger.error("Error verifying user session:", error);
        c.set('user', null);
        await next();
    }
};
export const requireAuth = async (c, next) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ message: "Authentication required" }, 401);
    }
    await next();
};
export const apiKeyAuth = async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (!apiKey || apiKey !== c.env.API_KEY) {
        logger.log('Invalid API key attempt:', c.req.raw.headers.get('cf-connecting-ip'));
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
};
