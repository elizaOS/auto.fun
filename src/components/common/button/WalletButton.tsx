"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useContext, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-wallets";
import { AutoConnectContext } from "@/components/providers";

export const WalletButton = () => {
  const { connect, disconnect, publicKey, connected, select } = useWallet();
  const { setAutoConnect } = useContext(AutoConnectContext);
  const buttonText = publicKey ? "Disconnect Wallet" : "Connect Wallet";

  useEffect(() => {
    select(PhantomWalletName);
  }, []);

  const toggleWalletConnection = async () => {
    if (connected) {
      localStorage.setItem("walletAutoConnect", "false");
      setAutoConnect(false);
      disconnect();
    } else {
      try {
        // do not remove the await, this is a promise and the typescript type is wrong
        // see https://github.com/anza-xyz/wallet-adapter/issues/743#issuecomment-2187296267
        await select(PhantomWalletName);
        await connect();
        localStorage.setItem("walletAutoConnect", "true");
        setAutoConnect(true);
      } catch (error) {
        console.log(error);
      }
    }
  };
  return (
    <RoundedButton onClick={toggleWalletConnection} className="p-3">
      {buttonText}
    </RoundedButton>
  );
};
