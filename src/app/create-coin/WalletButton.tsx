import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useState } from "react";

export const WalletButton = () => {
  const [isConnected, setIsConnected] = useState(
    window.localStorage.getItem("publicKey") ? true : false,
  );
  const buttonText = isConnected ? "Disconnect Wallet" : "Connect Wallet";

  const toggleWalletConnection = async () => {
    if (window.localStorage.getItem("publicKey")) {
      window.localStorage.removeItem("publicKey");
      setIsConnected(false);
      return;
    }

    if (window.solana && window.solana.isPhantom) {
      // Connect to the wallet if not already connected
      const resp = await window.solana.connect();
      const publicKey = resp.publicKey.toString();

      window.localStorage.setItem("publicKey", publicKey);
      setIsConnected(true);
    }
  };
  return (
    <RoundedButton onClick={toggleWalletConnection}>{buttonText}</RoundedButton>
  );
};
