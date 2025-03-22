import { useLocalStorage } from "@uidotdev/usehooks";
export const useMevProtection = () => {
    const [mevProtection, setMevProtection] = useLocalStorage("use-mev-protection", false);
    return [mevProtection, setMevProtection];
};
