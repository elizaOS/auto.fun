import { createHash, randomBytes } from "crypto";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { accessTokens, getDB, oauthVerifiers } from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import { eq } from "drizzle-orm";
import { StatusCode } from "hono/utils/http-status";

/**
 * ------------------------------------------------------------------
 * Custom Error Types
 * ------------------------------------------------------------------
 */
class TwitterAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwitterAPIError";
  }
}

class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * ------------------------------------------------------------------
 * Zod Schemas
 * ------------------------------------------------------------------
 */
const TwitterMessageSchema = z.object({
  created_at: z.string(),
  conversation_id: z.string(),
  id: z.string(),
  text: z.string(),
  edit_history_tweet_ids: z.array(z.string()),
  author_id: z.string(),
});
type TwitterMessage = z.infer<typeof TwitterMessageSchema>;

/**
 * ------------------------------------------------------------------
 * OAuth Utilities
 * ------------------------------------------------------------------
 */
function generateRandomString(length: number = 32): string {
  return randomBytes(length / 2).toString("hex");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = createHash("sha256").update(codeVerifier).digest();
  return digest
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * ------------------------------------------------------------------
 * Twitter API Functions
 * ------------------------------------------------------------------
 */
async function fetchUserTweets(
  userId: string,
  accessToken: string,
  useTestData: boolean = false,
): Promise<TwitterMessage[]> {
  const userTimelineUrl = `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=created_at,author_id,conversation_id,in_reply_to_user_id&exclude=retweets,replies`;

  const twitterResponse = await fetch(userTimelineUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`, // Using user's access token
    },
  });

  if (!twitterResponse.ok) {
    throw new TwitterAPIError(
      `Failed to fetch tweets: ${await twitterResponse.text()}`,
    );
  }

  const timelineData = (await twitterResponse.json()) as {
    data: TwitterMessage[];
  };
  const tweets = timelineData.data || [];

  if (tweets.length === 0) {
    throw new TwitterAPIError("No tweets found");
  }

  return tweets.map((tweet) => ({
    created_at: tweet.created_at,
    conversation_id: tweet.conversation_id,
    id: tweet.id,
    text: tweet.text,
    edit_history_tweet_ids: tweet.edit_history_tweet_ids || [],
    author_id: tweet.author_id,
  }));
}

async function fetchTwitterUser(
  userId: string,
  accessToken: string,
  useTestData: boolean = false,
): Promise<string> {
  logger.log("Fetching user info for:", userId);

  if (useTestData) {
    logger.log("Using test user data");
    return "123456";
  }

  // If no userId provided, get the authenticated user
  if (!userId) {
    const meResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meResponse.ok) {
      throw new TwitterAPIError(
        `Failed to fetch user data: ${await meResponse.text()}`,
      );
    }

    const meData = (await meResponse.json()) as { data: { id: string } };
    logger.log("Retrieved authenticated user ID:", meData.data.id);
    return meData.data.id;
  }

  // If userId is not a number, treat it as a username
  if (isNaN(Number(userId))) {
    const username = userId;
    const userLookupUrl = `https://api.twitter.com/2/users/by/username/${username}`;
    logger.log("Looking up user by username:", username);

    const userLookupResponse = await fetch(userLookupUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userLookupResponse.ok) {
      const errorText = await userLookupResponse.text();
      logger.error("User lookup failed:", errorText);
      throw new TwitterAPIError(`Failed to lookup user: ${errorText}`);
    }

    const userLookupData = (await userLookupResponse.json()) as {
      data: { id: string };
    };
    logger.log("Retrieved user ID for username:", userLookupData.data.id);
    return userLookupData.data.id;
  }

  // If userId is already a number, use it directly
  logger.log("Using provided numeric user ID:", userId);
  return userId;
}

/**
 * ------------------------------------------------------------------
 * Database Functions (Using Drizzle/D1 instead of Supabase)
 * ------------------------------------------------------------------
 */
async function storeOAuthState(
  env: Env,
  state: string,
  codeVerifier: string,
): Promise<void> {
  const db = getDB(env);
  const expiresAt = new Date(Date.now() + 600_000); // 10 minutes

  try {
    await db.insert(oauthVerifiers).values({
      id: nanoid(),
      state,
      code_verifier: codeVerifier,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    throw new Error(`Failed to store OAuth state: ${error}`);
  }
}

async function getOAuthState(
  env: Env,
  state: string,
): Promise<{ codeVerifier: string; expiresAt: Date } | null> {
  try {
    const db = getDB(env);
    const result = await db
      .select({
        code_verifier: oauthVerifiers.code_verifier,
        expires_at: oauthVerifiers.expires_at,
      })
      .from(oauthVerifiers)
      .where(eq(oauthVerifiers.state, state))
      .limit(1);

    if (!result.length) return null;

    return {
      codeVerifier: result[0].code_verifier,
      expiresAt: new Date(result[0].expires_at),
    };
  } catch (err) {
    logger.error("Error retrieving OAuth state:", err);
    return null;
  }
}

async function storeAccessToken(
  env: Env,
  token: string,
  refresh: string,
  expiresIn: number,
): Promise<void> {
  const db = getDB(env);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    // First delete any existing tokens
    await db.delete(accessTokens);

    // Then insert the new token
    await db.insert(accessTokens).values({
      id: nanoid(),
      access_token: token,
      refresh_token: refresh,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    throw new Error(`Failed to store access token: ${error}`);
  }
}

async function getRefreshToken(env: Env): Promise<string | null> {
  try {
    const db = getDB(env);
    const result = await db
      .select({ refresh_token: accessTokens.refresh_token })
      .from(accessTokens)
      .limit(1);

    if (!result.length) return null;
    return result[0].refresh_token;
  } catch (err) {
    logger.error("Error retrieving refresh token:", err);
    return null;
  }
}

async function updateAccessToken(
  env: Env,
  token: string,
  refresh: string,
  expiresIn: number,
): Promise<void> {
  const db = getDB(env);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    // Delete existing tokens
    await db.delete(accessTokens);

    // Insert the new token
    await db.insert(accessTokens).values({
      id: nanoid(),
      access_token: token,
      refresh_token: refresh,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    throw new Error(`Failed to update access token: ${error}`);
  }
}

/**
 * ------------------------------------------------------------------
 * Create Hono Router
 * ------------------------------------------------------------------
 */
const shareRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Enable CORS
shareRouter.use("*", async (c, next) => {
  const allowedOrigins = [
    c.req.header("Origin") || "localhost:5173",
    "https://basedorbiased.vercel.app",
    "http://localhost:5173",
    "https://basedorbiased.app",
  ];

  const origin = c.req.header("Origin");
  await next();

  c.header(
    "Access-Control-Allow-Origin",
    allowedOrigins.includes(origin!) ? origin! : allowedOrigins[0],
  );
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  c.header("Access-Control-Allow-Credentials", "true");

  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204 });
  }
});

/**
 * ------------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------------
 */

// OAuth Request Token
shareRouter.get("/oauth/request_token", async (c) => {
  const env = c.env;
  const clientId = env.TWITTER_CLIENT_ID;
  const redirectUri = `${env.NETWORK === "devnet" ? env.DEVNET_FRONTEND_URL : env.MAINNET_FRONTEND_URL}/callback`;

  logger.log("clientId", clientId);
  logger.log("redirectUri", redirectUri);

  const state = generateRandomString();
  const codeVerifier = generateRandomString();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "users.read",
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  await storeOAuthState(env, state, codeVerifier);

  const authorizationUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  logger.log("authorizationUrl", authorizationUrl);
  return c.redirect(authorizationUrl, 302);
});

// OAuth Callback
shareRouter.get("/oauth/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  logger.log("Handling oauth callback");

  if (!code || !state) {
    c.status(400);
    return c.json({ error: "Missing code or state" });
  }

  const storedState = await getOAuthState(c.env, state);
  if (!storedState) {
    c.status(400);
    return c.json({ error: "Invalid state or expired" });
  }

  const codeVerifier = storedState.codeVerifier;
  const clientId = c.env.TWITTER_CLIENT_ID;
  const redirectUri = `${c.env.NETWORK === "devnet" ? c.env.DEVNET_FRONTEND_URL : c.env.MAINNET_FRONTEND_URL}/callback`;

  const params = new URLSearchParams({
    code: code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  try {
    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Error exchanging authorization code:", errorText);
      c.status(response.status as StatusCode);
      return c.json({
        error: `Error exchanging authorization code: ${errorText}`,
      });
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    await storeAccessToken(
      c.env,
      data.access_token,
      data.refresh_token,
      data.expires_in,
    );

    return c.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    logger.error("Error in OAuth callback:", error);
    c.status(500);
    return c.json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error in OAuth callback",
    });
  }
});

// OAuth Refresh
shareRouter.post("/oauth/refresh", async (c) => {
  const refreshToken = await getRefreshToken(c.env);
  if (!refreshToken) {
    c.status(400);
    return c.json({ error: "Refresh token not found" });
  }

  const clientId = c.env.TWITTER_CLIENT_ID;
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: clientId,
  });

  try {
    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error refreshing access token: ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    await updateAccessToken(
      c.env,
      data.access_token,
      data.refresh_token,
      data.expires_in,
    );

    return c.json({
      access_token: data.access_token,
    });
  } catch (error) {
    logger.error("Error in OAuth refresh:", error);
    c.status(500);
    return c.json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error in OAuth refresh",
    });
  }
});

// Process Handler
shareRouter.post("/process", async (c) => {
  logger.log("Incoming process request");

  try {
    // Extract the access token from the Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid authorization header");
    }
    const accessToken = authHeader.split(" ")[1];

    logger.log("accessToken", accessToken);

    const requestBody = (await c.req.json()) as { userId: string };

    const useTestData = false; // Default to false if env.FAKE_API is not set

    logger.log("useTestData", useTestData);

    const twitterUserId = await fetchTwitterUser(
      requestBody.userId,
      accessToken,
      useTestData,
    );
    logger.log("twitterUserId", twitterUserId);

    const tweets = await fetchUserTweets(
      twitterUserId,
      accessToken,
      useTestData,
    );
    logger.log("tweets", tweets);

    return c.json({
      twitterUserId,
      tweets: tweets,
    });
  } catch (err) {
    logger.error("Error in /process handler:", err);

    let errorMessage = "An unknown error occurred";
    let statusCode = 500;

    if (err instanceof TwitterAPIError) {
      statusCode = 404;
      errorMessage = err.message;
    } else if (err instanceof LLMError) {
      statusCode = 500;
      errorMessage = err.message;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    c.status(statusCode as StatusCode);
    return c.json({ error: errorMessage });
  }
});

// Convert to base64
const convertToBase64 = (bytes: Uint8Array): string => {
  // Process the bytes in chunks to avoid stack overflow
  const CHUNK_SIZE = 1024; // Process 1KB at a time
  let result = "";

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(result);
};

// Tweet Handler
shareRouter.post("/tweet", async (c) => {
  try {
    // Validate the user's OAuth 2.0 token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid authorization header");
    }
    // We only need this to validate that the user is authenticated
    const userAccessToken = authHeader.split(" ")[1];

    logger.log("User authenticated with OAuth 2.0 token");

    // Handle media upload
    if (c.req.header("Content-Type")?.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const mediaFile = formData.get("media") as File;

      if (!mediaFile) {
        throw new Error("Missing required field: media");
      }

      logger.log("Media file type:", mediaFile.type);
      logger.log("Media file size:", mediaFile.size);

      // For large files, handle in chunks
      const mediaBuffer = await mediaFile.arrayBuffer();
      const mediaBytes = new Uint8Array(mediaBuffer);
      logger.log("Raw bytes length:", mediaBytes.length);

      // Use the chunked conversion function to avoid stack overflow
      const mediaBase64 = convertToBase64(mediaBytes);
      logger.log("Base64 length:", mediaBase64.length);

      const timestamp = Math.floor((Date.now() - 43200000) / 1000).toString();
      logger.log("Using timestamp:", timestamp);

      const oauthParams = {
        oauth_consumer_key: c.env.TWITTER_API_KEY,
        oauth_nonce: randomBytes(32)
          .toString("base64")
          .replace(/[^a-zA-Z0-9]/g, ""),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: timestamp,
        oauth_token: c.env.TWITTER_ACCESS_TOKEN,
        oauth_version: "1.0",
      };

      // INIT with raw byte length
      const initParams = {
        command: "INIT",
        total_bytes: mediaBytes.length.toString(),
        media_type: mediaFile.type || "image/png",
      };

      logger.log("INIT params:", initParams);

      const initSignature = await generateOAuth1Signature(
        "POST",
        "https://upload.twitter.com/1.1/media/upload.json",
        { ...oauthParams, ...initParams },
        c.env.TWITTER_API_SECRET,
        c.env.TWITTER_ACCESS_TOKEN_SECRET,
      );

      const initHeader = generateAuthHeader(oauthParams, initSignature);

      logger.log("Making INIT request...");
      const initBody = new URLSearchParams(initParams);

      const initResponse = await fetch(
        "https://upload.twitter.com/1.1/media/upload.json",
        {
          method: "POST",
          headers: {
            Authorization: initHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: initBody,
        },
      );

      const initResponseText = await initResponse.text();
      logger.log("INIT response status:", initResponse.status);
      logger.log("INIT response:", initResponseText);

      if (!initResponse.ok) {
        logger.error("INIT failed:", initResponseText);
        throw new Error(`INIT failed: ${initResponseText}`);
      }

      // Parse the response, handling potential JSON parsing errors
      let initData;
      try {
        initData = JSON.parse(initResponseText);
      } catch (e) {
        logger.error("Failed to parse INIT response:", e);
        throw new Error(
          `Failed to parse Twitter API response: ${initResponseText}`,
        );
      }

      if (!initData.media_id_string) {
        logger.error("No media ID in INIT response:", initData);
        throw new Error("Twitter API did not return a media ID");
      }

      const mediaId = initData.media_id_string;
      logger.log("Got media ID:", mediaId);

      // For images > 5MB, split into multiple segments
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for Twitter API
      const totalChunks = Math.ceil(mediaBase64.length / CHUNK_SIZE);

      // Process each chunk separately
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, mediaBase64.length);
        const chunk = mediaBase64.slice(start, end);

        logger.log(
          `Uploading chunk ${i + 1}/${totalChunks}, size: ${chunk.length}`,
        );

        // APPEND for each chunk
        const appendParams = {
          command: "APPEND",
          media_id: mediaId,
          segment_index: i.toString(),
          media_data: chunk,
        };

        const appendSignature = await generateOAuth1Signature(
          "POST",
          "https://upload.twitter.com/1.1/media/upload.json",
          { ...oauthParams, ...appendParams },
          c.env.TWITTER_API_SECRET,
          c.env.TWITTER_ACCESS_TOKEN_SECRET,
        );

        const appendHeader = generateAuthHeader(oauthParams, appendSignature);

        logger.log(`Uploading chunk ${i + 1}...`);
        const appendBody = new URLSearchParams(appendParams);
        const appendResponse = await fetch(
          "https://upload.twitter.com/1.1/media/upload.json",
          {
            method: "POST",
            headers: {
              Authorization: appendHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: appendBody,
          },
        );

        const appendResponseText = await appendResponse.text();
        logger.log(
          `APPEND chunk ${i + 1} response status:`,
          appendResponse.status,
        );

        if (appendResponseText) {
          logger.log(`APPEND chunk ${i + 1} response:`, appendResponseText);
        }

        if (!appendResponse.ok) {
          logger.error(`APPEND chunk ${i + 1} failed:`, appendResponseText);
          throw new Error(
            `APPEND chunk ${i + 1} failed: ${appendResponseText}`,
          );
        }
      }

      // FINALIZE
      const finalizeParams = {
        command: "FINALIZE",
        media_id: mediaId,
      };

      const finalizeSignature = await generateOAuth1Signature(
        "POST",
        "https://upload.twitter.com/1.1/media/upload.json",
        { ...oauthParams, ...finalizeParams },
        c.env.TWITTER_API_SECRET,
        c.env.TWITTER_ACCESS_TOKEN_SECRET,
      );

      const finalizeHeader = generateAuthHeader(oauthParams, finalizeSignature);

      logger.log("Finalizing upload...");
      const finalizeBody = new URLSearchParams(finalizeParams);
      const finalizeResponse = await fetch(
        "https://upload.twitter.com/1.1/media/upload.json",
        {
          method: "POST",
          headers: {
            Authorization: finalizeHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: finalizeBody,
        },
      );

      const finalizeResponseText = await finalizeResponse.text();
      logger.log("FINALIZE response status:", finalizeResponse.status);
      logger.log("FINALIZE response:", finalizeResponseText);

      if (!finalizeResponse.ok) {
        logger.error("FINALIZE failed:", finalizeResponseText);
        throw new Error(`FINALIZE failed: ${finalizeResponseText}`);
      }

      let finalizeData;
      try {
        finalizeData = JSON.parse(finalizeResponseText);
      } catch (e) {
        logger.error("Failed to parse FINALIZE response:", e);
        throw new Error(
          `Failed to parse Twitter API finalize response: ${finalizeResponseText}`,
        );
      }

      logger.log("Upload completed, returning media ID:", mediaId);

      return c.json({
        success: true,
        mediaId,
      });
    }

    // Handle tweet creation
    if (c.req.header("Content-Type")?.includes("application/json")) {
      const { text, mediaId } = (await c.req.json()) as {
        text: string;
        mediaId: string;
      };

      logger.log(
        "Posting tweet with text:",
        text.substring(0, 30) + "...",
        "and media ID:",
        mediaId,
      );

      const timestamp = Math.floor((Date.now() - 43200000) / 1000).toString();
      const oauthParams = {
        oauth_consumer_key: c.env.TWITTER_API_KEY,
        oauth_nonce: randomBytes(32)
          .toString("base64")
          .replace(/[^a-zA-Z0-9]/g, ""),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: timestamp,
        oauth_token: c.env.TWITTER_ACCESS_TOKEN,
        oauth_version: "1.0",
      };

      const tweetParams = {
        text: text,
        ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
      };

      const signature = await generateOAuth1Signature(
        "POST",
        "https://api.twitter.com/2/tweets",
        { ...oauthParams },
        c.env.TWITTER_API_SECRET,
        c.env.TWITTER_ACCESS_TOKEN_SECRET,
      );

      const authHeader = generateAuthHeader(oauthParams, signature);

      logger.log("Sending tweet request with OAuth 1.0a");
      const tweetResponse = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tweetParams),
      });

      // Handle error with detailed information
      if (!tweetResponse.ok) {
        const errorText = await tweetResponse.text();
        logger.error(
          "Tweet creation failed:",
          errorText,
          "Status:",
          tweetResponse.status,
        );
        throw new Error(`Failed to create tweet: ${errorText}`);
      }

      const responseData = await tweetResponse.json();
      logger.log("Tweet posted:", responseData);

      return c.json({
        success: true,
        tweet: responseData,
      });
    }

    throw new Error("Invalid request type");
  } catch (error) {
    logger.error("Error in tweet handler:", error);
    c.status(500);
    return c.json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to handle tweet request",
      details: error instanceof Error ? error.stack : undefined,
    });
  }
});

/**
 * ------------------------------------------------------------------
 * OAuth1 Signature Utilities
 * ------------------------------------------------------------------
 */
function generateAuthHeader(
  oauthParams: Record<string, string>,
  signature: string,
): string {
  return (
    "OAuth " +
    Object.entries({
      ...oauthParams,
      oauth_signature: signature,
    })
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`,
      )
      .join(", ")
  );
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str)
    .replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/\%20/g, "+");
}

async function generateOAuth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): Promise<string> {
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRFC3986(key)}=${encodeRFC3986(value)}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    encodeRFC3986(url),
    encodeRFC3986(paramString),
  ].join("&");

  const signingKey = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(tokenSecret)}`;

  const signature = await crypto.subtle
    .importKey(
      "raw",
      new TextEncoder().encode(signingKey),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    )
    .then((key) =>
      crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signatureBase)),
    );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Export the router
export default shareRouter;

// Add a new endpoint to fetch Twitter user profile
shareRouter.get("/twitter-user", async (c) => {
  try {
    // Extract the access token from the Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      c.status(401);
      return c.json({ error: "Missing or invalid authorization header" });
    }
    const accessToken = authHeader.split(" ")[1];

    // Include profile_image_url in the user fields
    const profileResponse = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      logger.error("Error fetching Twitter profile:", errorText);
      c.status(profileResponse.status as StatusCode);
      return c.json({ error: `Error fetching Twitter profile: ${errorText}` });
    }

    const profileData = await profileResponse.json();
    return c.json(profileData);
  } catch (error) {
    logger.error("Error in /twitter-user handler:", error);
    c.status(500);
    return c.json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error fetching Twitter profile",
    });
  }
});
