import { useState, useRef, useEffect, useCallback } from "react";

interface RateLimiterOptions {
  limit: number; // Maximum number of API calls allowed
  timeWindow: number; // Time window in milliseconds (e.g., 60000 for 1 minute)
}

export function useRateLimiter({ limit, timeWindow }: RateLimiterOptions) {
  const [isRateLimited, setIsRateLimited] = useState(false);
  const callTimesRef = useRef<number[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const makeApiCall = useCallback((): boolean => {
    const now = Date.now();

    // Remove timestamps older than the time window
    callTimesRef.current = callTimesRef.current.filter(
      (timestamp) => now - timestamp <= timeWindow,
    );
    callTimesRef.current.push(now);

    if (callTimesRef.current.length < limit) {
      return true;
    } else {
      // Rate limit exceeded
      setIsRateLimited(true);

      // Calculate time until the earliest call expires
      const earliestCall = callTimesRef.current[0];
      const timeUntilLift = timeWindow - (now - earliestCall);

      console.log(`lifting rate limit in ${timeUntilLift / 1000}s`);

      // If there's no existing timeout, set one to lift the rate limit
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          // Clean up and re-evaluate the rate limit
          const updatedNow = Date.now();
          callTimesRef.current = callTimesRef.current.filter(
            (timestamp) => updatedNow - timestamp <= timeWindow,
          );

          if (callTimesRef.current.length < limit) {
            setIsRateLimited(false);
          } else {
            // If still rate limited, set another timeout
            const nextEarliest = callTimesRef.current[0];
            const nextTimeUntilLift = timeWindow - (updatedNow - nextEarliest);
            timeoutRef.current = setTimeout(() => {
              timeoutRef.current = null;
            }, nextTimeUntilLift);
          }
        }, timeUntilLift);
      }

      return false; // Prevent API call
    }
  }, [limit, timeWindow]);

  // Clean up the timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isRateLimited, makeApiCall };
}
