import { useWallet } from "@solana/wallet-adapter-react";
import useAuthentication from "@/hooks/use-authentication";
import { useCallback, useState } from "react";

interface WalletLoginButtonProps {
  className?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const WalletLoginButton = ({
  className = "",
  onSuccess,
  onError,
}: WalletLoginButtonProps) => {
  const { publicKey, connecting } = useWallet();
  const { isAuthenticated, signInWithWallet } = useAuthentication();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSignIn = useCallback(async () => {
    if (!publicKey) {
      onError?.("Please connect your wallet first");
      return;
    }

    setIsAuthenticating(true);
    try {
      const success = await signInWithWallet();
      if (success) {
        onSuccess?.();
      } else {
        onError?.("Authentication failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      onError?.(
        error instanceof Error ? error.message : "Authentication failed",
      );
    } finally {
      setIsAuthenticating(false);
    }
  }, [publicKey, signInWithWallet, onSuccess, onError]);

  // Already connected and authenticated
  if (isAuthenticated) {
    return (
      <button
        className={`px-4 py-2 bg-green-600 text-white rounded-lg ${className}`}
        disabled
      >
        Authenticated
      </button>
    );
  }

  return (
    <button
      className={`px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg ${className}`}
      onClick={handleSignIn}
      disabled={!publicKey || connecting || isAuthenticating}
    >
      {isAuthenticating
        ? "Authenticating..."
        : !publicKey
          ? "Connect Wallet First"
          : "Sign In With Wallet"}
    </button>
  );
};

export default WalletLoginButton;
