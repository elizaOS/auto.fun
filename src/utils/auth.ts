/**
 * Sanitizes a token by removing any surrounding quotes
 * Can be used to clean tokens from localStorage
 */
export const sanitizeToken = (token: string | null): string | null => {
  if (!token) return null;

  // Explicitly handle the string "null" or "undefined"
  if (token === "null" || token === "undefined") {
    return null;
  }

  // Remove quotes if present
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }

  return token;
};

/**
 * Retrieves the authentication token from localStorage and ensures it's properly formatted
 * (without quotes)
 */
export const getAuthToken = (): string | null => {
  const authToken = localStorage.getItem("authToken");
  return sanitizeToken(authToken);
};

/**
 * Parses a JWT token and extracts its payload
 */
export const parseJwt = (token: string): any => {
  // Basic check for JWT structure
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    console.warn("Invalid JWT structure passed to parseJwt");
    return null;
  }

  try {
    // JWT structure: header.payload.signature
    const base64Url = token.split(".")[1];

    // Check if payload part exists
    if (!base64Url) {
      console.error("Invalid JWT: Missing payload part.");
      return null;
    }

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error parsing JWT:", error);
    return null;
  }
};

/**
 * Checks if a JWT token is expired
 * @returns true if token is expired or invalid, false if still valid
 */
export const isTokenExpired = (token: string | null): boolean => {
  // Check if token is a valid-looking JWT string
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return true; // Treat invalid format as expired/invalid
  }

  try {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;

    // exp is in seconds, Date.now() is in milliseconds
    return Date.now() >= payload.exp * 1000;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    return true;
  }
};
