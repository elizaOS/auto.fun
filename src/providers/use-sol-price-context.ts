import { createContext, useContext } from "react";

export const useSolPriceContext = () => useContext(SolPriceContext);

interface SolPriceContextType {
  solPrice: number | undefined;
  isLoading: boolean;
  error: Error | null;
}

export const SolPriceContext = createContext<SolPriceContextType>({
  solPrice: undefined,
  isLoading: false,
  error: null,
});
