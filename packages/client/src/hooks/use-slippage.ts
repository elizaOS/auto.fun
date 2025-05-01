import { useLocalStorage } from "@uidotdev/usehooks";

type TSlippage = number;

export const useSlippage = () => {
  const [slippage, setSlippage] = useLocalStorage<TSlippage>("use-slippage", 4);
  return [slippage, setSlippage] as const;
};
