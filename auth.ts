import { Request, Response, NextFunction, CookieOptions } from "express";
import { SIWS } from "@web3auth/sign-in-with-solana";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface Request {
      user?: { publicKey: string } | null;
    }
  }
}

export const generateNonce = async (req: Request, res: Response) => {
  const timestamp = Date.now();

  return res.json({ nonce: timestamp.toString() });
};

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  maxAge: 3600000 * 24,
  domain: process.env.NODE_ENV === "production" ? "auto.fun" : undefined,
}

export const authenticate = async (req: Request, res: Response) => {
  const { header, payload, signature } = req.body;
  /**
   * prevent replay attacks by limiting the time window for nonce validation
   */
  const MAX_NONCE_AGE = 5 * 60 * 1000; // 5 minutes

  if (!header || !payload || !signature) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const msg = new SIWS({ header, payload });
  const verified = await msg.verify({ payload, signature });

  if (verified.error) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  const timestamp = verified.data.payload.nonce;

  const nonceAge = Date.now() - parseInt(timestamp, 10);
  if (nonceAge > MAX_NONCE_AGE) {
    return res.status(401).json({ message: "Nonce has expired" });
  }

  res.cookie("publicKey", verified.data.payload.address, cookieOptions);

  return res.json({ message: "Authentication successful" });
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie("publicKey", cookieOptions);
  return res.json({ message: "Logout successful" });
};

export const authStatus = async (req: Request, res: Response) => {
  try {
    const publicKey = req.cookies?.publicKey;
    return res.json({ authenticated: !!publicKey })
  } catch (error) {
    console.error("Error verifying user session:", error);
    return res.json({ authenticated: false });
  }
}

/**
 * http only cookie cannot be tampered with, so we can trust it
 */
export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const publicKey = req.cookies?.publicKey;

    if (!publicKey) {
      console.warn("No authentication cookie found");
      req.user = null;
    } else {
      // Attach the public key to the request object for use in subsequent handlers
      req.user = { publicKey };
      console.log("User authenticated", req.user);
    }

    next();
  } catch (error) {
    console.error("Error verifying user session:", error);
    req.user = null;
    next();
  }
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
};


// export const createJWT = (address: string) => {
//   return jwt.sign({ address }, JWT_SECRET, { expiresIn: '24h' });
// };

// export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
//   const token = req.headers.authorization?.split(' ')[1];
  
//   if (!token) {
//     return res.status(401).json({ error: 'No token provided' });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET) as { address: string };
//     req.user = decoded;
//     next();
//   } catch (error) {
//     return res.status(401).json({ error: 'Invalid token' });
//   }
// };

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    logger.log('Invalid API key attempt:', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};