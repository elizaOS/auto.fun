/**
 * Sanitizes a token by removing any surrounding quotes
 * Can be used to clean tokens from localStorage
 */
export const sanitizeToken = (token: string | null): string | null => {
  if (!token) return null;

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
  try {
    // JWT structure: header.payload.signature
    const base64Url = token.split(".")[1];
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
  if (!token) return true;

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
