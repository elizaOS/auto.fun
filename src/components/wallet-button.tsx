import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect } from "react";
import { useWalletModal } from "../hooks/use-wallet-modal";

const WalletButton = () => {
  const {
    publicKey,
    disconnect,
    connecting,
    connected,
    disconnecting,
    wallet,
  } = useWallet();
  const { setVisible } = useWalletModal();

  // Handle button click - just disconnect or open modal
  const handleClick = useCallback(async () => {
    if (connected) {
      try {
        // Simple disconnect without any custom state management
        await disconnect();
        console.log("Wallet disconnected");
      } catch (error) {
        console.error("Error disconnecting wallet:", error);
      }
    } else if (!connecting) {
      console.log("Opening wallet modal");
      setVisible(true);
    }
  }, [connected, connecting, disconnect, disconnecting, setVisible]);

  // Simple button text
  const buttonText = connecting
    ? "Connecting..."
    : connected
      ? "Disconnect Wallet"
      : "Connect Wallet";

  // Log wallet state for debugging
  useEffect(() => {
    console.log("Wallet state:", {
      connected,
      connecting,
      wallet: wallet?.adapter.name,
      publicKey: publicKey?.toString(),
    });
  }, [connected, connecting, wallet, publicKey]);

  return (
    <button
      className="px-4 py-2.5 gap-2 h-11 rounded-md bg-[#2e2e2e] border border-neutral-800 text-white"
      onClick={handleClick}
      disabled={connecting}
    >
      {buttonText}
    </button>
  );
};

export default WalletButton;
