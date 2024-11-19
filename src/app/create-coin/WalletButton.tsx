import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

export const useWallet = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateQuery = useCallback(
    (key: string, value?: string) => {
      const currentParams = new URLSearchParams(searchParams?.toString());

      if (value) {
        currentParams.set(key, value);
      } else {
        currentParams.delete(key);
      }

      router.push(`?${currentParams.toString()}`);
    },
    [router, searchParams],
  );

  return useMemo(
    () => ({
      connectWallet: (publicKey: string) => updateQuery("publicKey", publicKey),
      disconnectWallet: () => updateQuery("publicKey"),
      publicKey: searchParams.get("publicKey"),
    }),
    [searchParams, updateQuery],
  );
};

export const WalletButton = () => {
  const { connectWallet, disconnectWallet, publicKey } = useWallet();
  const buttonText = publicKey ? "Disconnect Wallet" : "Connect Wallet";

  useEffect(() => {
    if (publicKey) {
      // TODO: api call to get balance
      // getSolanaBalance(publicKey).then(console.log);
    }
  });

  const toggleWalletConnection = async () => {
    if (publicKey) {
      disconnectWallet();
    } else if (window.solana && window.solana.isPhantom) {
      // Connect to the wallet if not already connected
      const resp = await window.solana.connect();
      const publicKey = resp.publicKey.toString();

      connectWallet(publicKey);
    }
  };
  return (
    <RoundedButton onClick={toggleWalletConnection}>{buttonText}</RoundedButton>
  );
};
