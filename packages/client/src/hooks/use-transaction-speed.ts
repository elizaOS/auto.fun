import { useLocalStorage } from "@uidotdev/usehooks";

type TTransactionSpeed = "fast" | "turbo" | "ultra";

export const useTransactionSpeed = () => {
  const [transactionSpeed, setTransactionSpeed] =
    useLocalStorage<TTransactionSpeed>("use-transaction-speed", "turbo");
  return [transactionSpeed, setTransactionSpeed] as const;
};
