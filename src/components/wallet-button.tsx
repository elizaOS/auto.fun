import useAuthentication from "@/hooks/use-authentication";
import { useUser } from "@/hooks/use-user";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import { shortenAddress } from "@/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronDown, Copy, LogOut, Trophy, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Button from "./button";

const WalletButton = () => {
  const navigate = useNavigate();
  const { publicKey, connecting, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const {
    isAuthenticated,
    signOut,
    isAuthenticating,
    authToken,
    walletAddress,
  } = useAuthentication();
  const { user } = useUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check for direct Phantom connection
  const hasDirectPhantomConnection =
    typeof window !== "undefined" &&
    window.solana?.isPhantom &&
    window.solana?.publicKey;

  // Get wallet display public key from either source
  const displayPublicKey =
    publicKey ||
    (hasDirectPhantomConnection ? window.solana?.publicKey : null) ||
    (walletAddress ? { toString: () => walletAddress } : null);

  // Handle clicks outside of dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // When walletAddress changes, try to reconnect
  useEffect(() => {
    if (
      walletAddress &&
      !publicKey &&
      !hasDirectPhantomConnection &&
      !isAuthenticating
    ) {
      console.log(
        "WalletButton: Have wallet address but no connection, attempting reconnection",
      );

      // Try to connect directly to Phantom if available
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom
      ) {
        try {
          window.solana
            .connect()
            .then((_response) => {
              console.log("WalletButton: Successfully reconnected to Phantom");
            })
            .catch((err) =>
              console.error("WalletButton: Error auto-connecting:", err),
            );
        } catch (e) {
          console.error("WalletButton: Error during auto-connect attempt:", e);
        }
      }
    }
  }, [walletAddress, publicKey, hasDirectPhantomConnection, isAuthenticating]);

  // Try to connect wallet on load if we have a token but no connection
  useEffect(() => {
    if (!isAuthenticated && !isAuthenticating && authToken) {
      console.log(
        "WalletButton: Have token but not authenticated, attempting reconnection",
      );

      // Try to connect directly to Phantom if available
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom &&
        !window.solana.publicKey
      ) {
        try {
          window.solana
            .connect()
            .catch((err) => console.error("Error auto-connecting:", err));
        } catch (e) {
          console.error("Error during auto-connect attempt:", e);
        }
      }
    }
  }, [isAuthenticated, isAuthenticating, authToken]);

  // Handle copy wallet address
  const handleCopyAddress = async () => {
    if (displayPublicKey) {
      await navigator.clipboard.writeText(displayPublicKey.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  // Handle navigation to profile
  const handleViewProfile = () => {
    navigate("/profile");
    setMenuOpen(false);
  };

  // Handle disconnect with proper cleanup
  const handleDisconnect = async () => {
    try {
      signOut(); // This will handle both adapter and direct Phantom disconnection
      setMenuOpen(false);
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
    }
  };

  // Determine button text based on connection state
  const buttonText =
    connecting || isAuthenticating
      ? "Connecting..."
      : isAuthenticated
        ? shortenAddress(displayPublicKey?.toString() || "")
        : "Connect Wallet";

  // Get wallet icon - for now just use Phantom icon if directly connected
  const walletIcon =
    wallet?.adapter.icon ||
    (hasDirectPhantomConnection ? "https://phantom.app/favicon.ico" : null);

  // If authenticated, show the dropdown button
  if (isAuthenticated && displayPublicKey) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="large"
          className="px-2"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <div className="flex items-center gap-2.5 justify-between m-auto">
            <span className="font-satoshi font-medium">
              {shortenAddress(displayPublicKey.toString())}
            </span>

            {walletIcon && (
              <img
                src={walletIcon}
                height={18}
                width={18}
                alt={`wallet_icon_${wallet?.adapter?.name || "phantom"}`}
              />
            )}
            <ChevronDown className="size-5 text-autofun-icon-secondary" />
          </div>
        </Button>

        {menuOpen && (
          <div className="absolute z-50 right-0 mt-2 bg-[#171717] border border-[#262626] shadow-lg overflow-hidden w-48">
            <ul className="py-2">
              <li className="opacity-50 px-4 py-2 text-sm text-white flex items-center gap-2">
                <Trophy size={16} />
                <span>{user?.points ?? 0} points</span>
              </li>
              {/* <li className="opacity-50 px-4 py-2 text-sm text-white flex items-center gap-2">
                <Wallet size={16} />
                <span>
                  {user?.solBalance ? user.solBalance.toFixed(2) : "0.00"} SOL
                </span>
              </li> */}
              {/* <li className="opacity-50 px-4 py-2 text-sm text-white flex items-center gap-2">
                <DollarSign size={16} />
                <span>${solPrice ? solPrice.toFixed(2) : "0.00"} / SOL</span>
              </li> */}
              <li
                className="px-4 py-2 text-sm text-white hover:bg-[#262626] cursor-pointer flex items-center gap-2"
                onClick={handleCopyAddress}
              >
                <Copy size={16} />
                {copied ? "Copied!" : "Copy Address"}
              </li>
              <li
                className="px-4 py-2 text-sm text-white hover:bg-[#262626] cursor-pointer flex items-center gap-2"
                onClick={handleViewProfile}
              >
                <User size={16} />
                Profile
              </li>

              <li
                className="px-4 py-2 text-sm text-white hover:bg-[#262626] cursor-pointer flex items-center gap-2"
                onClick={handleDisconnect}
              >
                <LogOut size={16} />
                Disconnect
              </li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  // If not authenticated, show connect button
  return (
    <Button
      size="large"
      onClick={() => {
        setVisible(true);
      }}
      disabled={connecting || isAuthenticating}
    >
      {buttonText}
    </Button>
  );
};

export default WalletButton;
