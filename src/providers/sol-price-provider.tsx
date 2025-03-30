import { createContext, useContext, ReactNode } from "react";
import { useSolPrice } from "@/hooks/use-sol-price";

interface SolPriceContextType {
  solPrice: number | undefined;
  isLoading: boolean;
  error: Error | null;
}

const SolPriceContext = createContext<SolPriceContextType>({
  solPrice: undefined,
  isLoading: false,
  error: null,
});

export const useSolPriceContext = () => useContext(SolPriceContext);

export function SolPriceProvider({ children }: { children: ReactNode }) {
  const { data: solPrice, isLoading, error } = useSolPrice();

  return (
    <SolPriceContext.Provider value={{ solPrice, isLoading, error: error as Error }}>
      {children}
    </SolPriceContext.Provider>
  );
} 