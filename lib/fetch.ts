import fetchRetry from "fetch-retry";
import { logger } from "../logger";

const fetchWithRetry = fetchRetry(fetch);

export function fetchWithExponentialBackoff(
  url: string,
  options?: RequestInit
) {
  // Perform the fetch with retry logic
  return fetchWithRetry(url, {
    retryDelay: (attempt) => Math.pow(2, attempt) * 1000, // Exponential backoff: 1s, 2s, 4s
    retryOn: (attempt, error, response) => {
      logger.log(`Retrying request`, { attempt, error, response });

      const MAX_RETRIES = 3;
      if (attempt >= MAX_RETRIES) {
        return false;
      }

      // Retry on network errors or 500-level status codes
      if (error !== null) {
        return true; // Retry on network errors
      }
      if (response && response.status >= 500 && response.status < 600) {
        return true; // Retry on 500-level responses
      }
      return false; // Do not retry otherwise
    },
    ...options,
  });
}
