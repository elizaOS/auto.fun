import { useSolPrice } from "@/hooks/use-sol-price";
import { ReactNode, useEffect, useState } from "react";
import { SolPriceContext } from "./use-sol-price-context";
import { useWebSocket } from "@/hooks/use-websocket";

// Default fallback value
const DEFAULT_SOL_PRICE = 135.0;

export function SolPriceProvider({ children }: { children: ReactNode }) {
  // Use a local state for immediate default value
  const [initialLoading, setInitialLoading] = useState(true);

  // Get the React Query wrapped SOL price
  const { data: querySolPrice, isLoading, error } = useSolPrice();

  // WebSocket functionality for price updates
  const { connected, requestSolPrice } = useWebSocket();

  // Define immediate values for context
  const solPrice = initialLoading ? DEFAULT_SOL_PRICE : querySolPrice;

  // Request SOL price updates whenever we connect to WebSocket
  // This ensures we get fresh price data upon application initialization
  useEffect(() => {
    if (connected) {
      console.log(
        "SolPriceProvider: WebSocket connected, requesting SOL price update",
      );
      requestSolPrice();

      // Once connected, we can stop using the initial value
      if (initialLoading) {
        setInitialLoading(false);
      }
    }
  }, [connected, requestSolPrice, initialLoading]);

  // After a delay, consider initialization complete even if WS didn't connect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (initialLoading) {
        console.log(
          "SolPriceProvider: Initialization timeout reached, using query data",
        );
        setInitialLoading(false);
      }
    }, 2000); // 2 second timeout

    return () => clearTimeout(timeoutId);
  }, [initialLoading]);

  return (
    <SolPriceContext.Provider
      value={{
        solPrice,
        isLoading: initialLoading || isLoading,
        error: error as Error,
      }}
    >
      {children}
    </SolPriceContext.Provider>
  );
}
