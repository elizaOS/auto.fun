import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import Button from "./button";
import { shortenAddress } from "@/utils";
import { ChevronDown, Copy, LogOut, User, Trophy } from "lucide-react";
import { useNavigate } from "react-router";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import useAuthentication from "@/hooks/use-authentication";
import { useUser } from "@/hooks/use-user";

const WalletButton = () => {
  const navigate = useNavigate();
  const { publicKey, connecting, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { isAuthenticated, signOut } = useAuthentication();
  const { user } = useUser();
  console.log(user);

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Handle copy wallet address
  const handleCopyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  // Handle navigation to profile
  const handleViewProfile = () => {
    navigate("/profile");
    setMenuOpen(false);
  };

  const buttonText = connecting
    ? "Connecting..."
    : isAuthenticated
      ? "Disconnect Wallet"
      : "Connect Wallet";

  if (isAuthenticated) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="large"
          className="px-2"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <div className="flex items-center gap-2.5 justify-between m-auto">
            <span className="font-satoshi font-medium">
              {wallet?.adapter?.publicKey?.toString()
                ? shortenAddress(wallet?.adapter?.publicKey?.toString())
                : null}
            </span>

            {wallet?.adapter.icon ? (
              <img
                src={wallet?.adapter?.icon}
                height={18}
                width={18}
                alt={`wallet_icon_${wallet?.adapter?.name}`}
              />
            ) : null}
            <ChevronDown className="size-5 text-autofun-icon-secondary" />
          </div>
        </Button>

        {menuOpen && (
          <div className="absolute z-50 right-0 mt-2 bg-[#171717] border border-[#262626] shadow-lg overflow-hidden w-48">
            <ul className="py-2">
              {/* {user && ( */}
              <li className="opacity-50 px-4 py-2 text-sm text-white flex items-center gap-2">
                <Trophy size={16} />
                <span>{0} points</span>
              </li>
              {/* )} */}
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
                onClick={signOut}
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

  return (
    <Button
      size="large"
      onClick={() => {
        setVisible(true);
      }}
      disabled={connecting}
    >
      {buttonText}
    </Button>
  );
};

export default WalletButton;
