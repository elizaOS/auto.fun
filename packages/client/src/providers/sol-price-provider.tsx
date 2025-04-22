import { useSolPrice } from "@/hooks/use-sol-price";
import { ReactNode } from "react";
import { SolPriceContext } from "./use-sol-price-context";

export function SolPriceProvider({ children }: { children: ReactNode }) {
  const { data: solPrice, isLoading, error } = useSolPrice();

  return (
    <SolPriceContext.Provider
      value={{ solPrice, isLoading, error: error as Error }}
    >
      {children}
    </SolPriceContext.Provider>
  );
}
