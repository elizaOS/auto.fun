import { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useWalletModal } from "../hooks/use-wallet-modal";

const WalletButton = () => {
  const {
    publicKey,
    connecting,
    connected,
    signIn,
    wallet,
    select,
    connect,
    disconnect,
  } = useWallet();
  const { setVisible, hasStoredWallet } = useWalletModal();
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);

  // Attempt to auto-connect on initial render if we have a stored wallet
  useEffect(() => {
    const attemptAutoConnect = async () => {
      if (hasStoredWallet && !connected && !connecting) {
        const lastWalletName = localStorage.getItem('lastWalletName');
        if (lastWalletName) {
          try {
            console.log("attemptAutoConnect", lastWalletName);
            setIsAutoConnecting(true);
            // await select(lastWalletName as WalletName);
            if(signIn) {
              await signIn();
            } else { console.log("signIn odesnt exist", signIn);
              await select(lastWalletName as WalletName);
            }
            if(!signIn) {
              await connect();
            }
            console.log("Auto-connected to wallet:", lastWalletName);
          } catch (error) {
            console.error("Failed to auto-connect:", error);
            // Clear stored wallet data on failed connect
            localStorage.removeItem('walletConnected');
            localStorage.removeItem('lastWalletName');
          } finally {
            setIsAutoConnecting(false);
          }
        }
      }
    };

    attemptAutoConnect();
  }, [hasStoredWallet, connected, connecting, select, connect]);

  // Store wallet connection state when connected
  useEffect(() => {
    if (connected && wallet) {
      // Save wallet connection info in localStorage
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('lastWalletName', wallet.adapter.name);
    }
  }, [connected, wallet]);

  // Handle button click - just disconnect or open modal
  const handleClick = async () => {
    if (connected) {
      try {
        // Simple disconnect without any custom state management
        await disconnect();
        // Clear connection data on disconnect
        localStorage.removeItem('walletConnected');
        localStorage.removeItem('lastWalletName');
        console.log("Wallet disconnected");
      } catch (error) {
        console.error("Error disconnecting wallet:", error);
      }
    } else if (!connecting && !isAutoConnecting) {
      console.log("Opening wallet modal");
      setVisible(true);
    }
  }

  // Simple button text
  const buttonText = connecting || isAutoConnecting
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
      disabled={connecting || isAutoConnecting}
    >
      {buttonText}
    </button>
  );
};

export default WalletButton;
