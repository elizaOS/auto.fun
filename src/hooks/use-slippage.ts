import { useLocalStorage } from "@uidotdev/usehooks";

export type TSlippage = number;

export const useSlippage = () => {
  const [slippage, setSlippage] = useLocalStorage<TSlippage>("use-slippage", 5);
  return [slippage, setSlippage] as const;
};
