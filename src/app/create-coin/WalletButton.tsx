import { RoundedButton } from "@/components/common/button/RoundedButton";
import { getSolanaBalance } from "@/utils/wallet";
import { useEffect, useState } from "react";

export const WalletButton = () => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const buttonText = publicKey ? "Disconnect Wallet" : "Connect Wallet";

  useEffect(() => {
    const publicKey = window.localStorage.getItem("publicKey");
    if (publicKey) {
      setPublicKey(publicKey);
    }
  }, []);

  useEffect(() => {
    if (publicKey) {
      getSolanaBalance(publicKey).then(console.log);
    }
  });

  const toggleWalletConnection = async () => {
    if (window.localStorage.getItem("publicKey")) {
      window.localStorage.removeItem("publicKey");
      setPublicKey(null);
      return;
    }

    if (window.solana && window.solana.isPhantom) {
      // Connect to the wallet if not already connected
      const resp = await window.solana.connect();
      const publicKey = resp.publicKey.toString();

      window.localStorage.setItem("publicKey", publicKey);
      setPublicKey(publicKey);
    }
  };
  return (
    <RoundedButton onClick={toggleWalletConnection}>{buttonText}</RoundedButton>
  );
};
