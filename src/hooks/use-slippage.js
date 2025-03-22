import { useLocalStorage } from "@uidotdev/usehooks";
export const useSlippage = () => {
    const [slippage, setSlippage] = useLocalStorage("use-slippage", 5);
    return [slippage, setSlippage];
};
