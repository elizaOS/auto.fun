import { useLocalStorage } from "@uidotdev/usehooks";

export type TMevProtection = boolean;

export const useMevProtection = () => {
  const [mevProtection, setMevProtection] = useLocalStorage<TMevProtection>(
    "use-mev-protection",
    false
  );
  return [mevProtection, setMevProtection] as const;
};
