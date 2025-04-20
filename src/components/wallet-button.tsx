import useAuthentication from "@/hooks/use-authentication";
import { useUser } from "@/hooks/use-user";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import { shortenAddress } from "@/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronDown, Copy, LogOut, Trophy, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Button from "./button";
import { abbreviateNumber } from "@/utils";
// Force re-initialization of PhantomWalletAdapter
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useSolBalance } from "@/hooks/use-token-balance";
import SkeletonImage from "./skeleton-image";

const WalletButton = () => {
  const navigate = useNavigate();
  const { publicKey, connecting, wallet, connected } = useWallet();
  const solBalance = useSolBalance();

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
  const [walletIcon, setWalletIcon] = useState<string | null>(null);

  // Create a wallet adapter instance directly in the component to access its icon
  useEffect(() => {
    if (
      (connected || isAuthenticated) &&
      !walletIcon &&
      typeof window !== "undefined" &&
      window.solana?.isPhantom
    ) {
      // Create a fresh adapter to get the icon
      const adapter = new PhantomWalletAdapter();
      // PhantomWalletAdapter initializes immediately with the icon property
      if (adapter.icon) {
        setWalletIcon(adapter.icon);
      }
    }
  }, [connected, isAuthenticated, walletIcon]);

  // Also set icon from wallet when it becomes available
  useEffect(() => {
    if (wallet?.adapter.icon && !walletIcon) {
      setWalletIcon(wallet.adapter.icon);
    }
  }, [wallet, walletIcon]);

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
      // Try to connect directly to Phantom if available
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom
      ) {
        window.solana
          .connect()
          .then((_response: any) => {
            // Try to load icon if not yet loaded
            if (!walletIcon) {
              const adapter = new PhantomWalletAdapter();
              if (adapter.icon) {
                setWalletIcon(adapter.icon);
              }
            }
          })
          .catch((err: any) => console.error("Error auto-connecting:", err));
      }
    }
  }, [
    walletAddress,
    publicKey,
    hasDirectPhantomConnection,
    isAuthenticating,
    walletIcon,
  ]);

  // Try to connect wallet on load if we have a token but no connection
  useEffect(() => {
    if (!isAuthenticated && !isAuthenticating && authToken) {
      // Try to connect directly to Phantom if available
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom &&
        !window.solana.publicKey
      ) {
        window.solana
          .connect()
          .then(() => {
            // Try to load icon if not yet loaded
            if (!walletIcon) {
              const adapter = new PhantomWalletAdapter();
              if (adapter.icon) {
                setWalletIcon(adapter.icon);
              }
            }
          })
          .catch((err: any) => console.error("Error auto-connecting:", err));
      }
    }
  }, [isAuthenticated, isAuthenticating, authToken, walletIcon]);

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
    signOut(); // This will handle both adapter and direct Phantom disconnection
    setMenuOpen(false);
    setWalletIcon(null);
  };

  // Determine button text based on connection state
  const buttonText =
    connecting || isAuthenticating
      ? "Connecting..."
      : isAuthenticated
        ? shortenAddress(displayPublicKey?.toString() || "")
        : "Connect";

  // Get wallet icon - use the stored state which will be populated
  // from either wallet.adapter.icon or our own adapter instance
  const walletIconSrc = wallet?.adapter.icon || walletIcon;

  // If authenticated, show the dropdown button
  if (isAuthenticated && displayPublicKey) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="large"
          className="p-2 md:px-3 border-none bg-autofun-background-action-primary"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <div className="flex items-center md:gap-2.5 justify-between m-auto">
            <span className="font-satoshi font-medium">
              {shortenAddress(displayPublicKey.toString())}
            </span>

            {walletIconSrc && (
              <img
                src={walletIconSrc}
                height={18}
                width={18}
                alt={`wallet_icon_${wallet?.adapter?.name || "phantom"}`}
                className="hidden md:inline"
              />
            )}
            <ChevronDown className="size-5 text-autofun-icon-secondary" />
          </div>
        </Button>

        {menuOpen && (
          <div className="absolute z-50 right-0 mt-2 bg-[#171717] border border-[#262626] shadow-lg overflow-hidden w-48">
            <ul className="py-2">
              <li className="opacity-50 px-4 py-2 text-sm text-white flex items-centerjustofy-between gap-2">
                <SkeletonImage
                  parentClassName="w-4 h-4"
                  src="/solana.svg"
                  width={32}
                  height={32}
                  alt="solana_logo"
                  className="w-4 h-4 inline"
                />
                {Number(solBalance).toFixed(2)}
              </li>
              <li className="opacity-50 px-4 py-2 text-sm text-white flex items-center gap-2">
                <Trophy size={16} />
                <span>
                  {user?.points ? abbreviateNumber(user?.points, true) : 0}{" "}
                  points
                </span>
              </li>
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
      className="min-w-[150px]"
    >
      {buttonText}
    </Button>
  );
};

export default WalletButton;
