import { useLocalStorage } from "@uidotdev/usehooks";
export const useTransactionSpeed = () => {
    const [transactionSpeed, setTransactionSpeed] = useLocalStorage("use-transaction-speed", "turbo");
    return [transactionSpeed, setTransactionSpeed];
};
