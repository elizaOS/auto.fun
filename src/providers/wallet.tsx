import SkeletonImage from "@/components/skeleton-image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useWalletAuthentication,
  useWalletModal,
  WalletModalContext,
} from "@/hooks/use-wallet-modal";
import { useUser } from "@/contexts/user";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { FC, ReactNode } from "react";
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface WalletModalProviderProps {
  children: ReactNode;
  className?: string;
  container?: string;
}

export interface WalletModalProps {
  className?: string;
  container?: string;
}

const WalletListItem: FC<{
  wallet: Wallet;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}> = ({ wallet, handleClick, tabIndex = 0 }) => {
  return (
    <li>
      <button
        onClick={handleClick}
        className="cursor-pointer bg-autofun-background-action-primary w-full flex items-center justify-between px-4 py-3 transition-colors"
        tabIndex={tabIndex}
      >
        <div className="flex items-center gap-1 m-auto">
          {wallet.adapter.icon ? (
            <img
              src={wallet?.adapter?.icon}
              height={18}
              width={18}
              alt={`wallet_icon_${wallet?.adapter?.name}`}
            />
          ) : null}
          <span className="font-satoshi text-white text-sm font-medium m-auto">
            {wallet.adapter.name}
          </span>
        </div>
        {wallet.readyState === WalletReadyState.Installed && (
          <span className="text-xs font-dm-mono text-autofun-background-action-highlight font-medium absolute right-6">
            Installed
          </span>
        )}
      </button>
    </li>
  );
};

export const WalletModal: FC<WalletModalProps> = () => {
  const { wallets, select, signIn, connect } = useWallet();
  const { visible, setVisible, isAuthenticated } = useWalletModal();
  const [connecting, setConnecting] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletName | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Get access to wallet state
  const { connected, publicKey } = useWallet();

  // Auto-close if already connected and authenticated
  useEffect(() => {
    if (visible && connected && publicKey && isAuthenticated) {
      console.log("Already connected and authenticated, auto-closing modal");
      setTimeout(() => hideModal(), 300);
    }
  }, [visible, connected, publicKey, isAuthenticated]);

  const [installedWallets] = useMemo(() => {
    const installed: Wallet[] = [];
    const notInstalled: Wallet[] = [];

    for (const wallet of wallets) {
      if (wallet.readyState === WalletReadyState.Installed) {
        installed.push(wallet);
      } else {
        notInstalled.push(wallet);
      }
    }

    return installed.length ? [installed, notInstalled] : [notInstalled, []];
  }, [wallets]);

  const hideModal = useCallback(() => {
    setVisible(false);
    setConnecting(false);
    setSelectedWallet(null);
    setConnectionAttempts(0);
  }, [setVisible]);

  // Function to attempt wallet connection with retries
  const attemptWalletConnection = useCallback(
    async (walletName: WalletName, attempt: number = 1) => {
      console.log(`Connection attempt ${attempt} for ${walletName}`);

      // Check if already connected before doing anything
      if (connected && publicKey) {
        console.log(
          "Wallet already connected before attempt, success:",
          publicKey.toString(),
        );
        return true;
      }

      if (attempt > 3) {
        console.error("Failed to connect after multiple attempts");
        setConnecting(false);
        return false;
      }

      try {
        // First try to select the wallet
        await select(walletName);

        // Wait longer with each attempt
        const delay = 800 + attempt * 200; // 1000ms, 1200ms, 1400ms
        console.log(`Waiting ${delay}ms before connecting...`);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Skip connect if we're already connected
        if (connected && publicKey) {
          console.log(
            "Wallet already connected, skipping connect call:",
            publicKey.toString(),
          );
          return true;
        }

        // Try to connect
        try {
          if (signIn) {
            console.log("Using signIn method");
            await signIn();
          } else {
            console.log("Using connect method");
            await connect();
          }

          console.log("Wallet connected successfully!");
          return true;
        } catch (connectError) {
          // If wallet appears connected despite connect error, consider it a success
          if (connected && publicKey) {
            console.log(
              "Connect call failed but wallet appears connected:",
              publicKey.toString(),
            );
            return true;
          }
          throw connectError; // Re-throw if not connected
        }
      } catch (error) {
        // Check if it's a WalletNotSelectedError
        const errorString = String(error);
        if (errorString.includes("WalletNotSelectedError")) {
          // One last check if we're actually connected despite the error
          if (connected && publicKey) {
            console.log(
              "Ignoring WalletNotSelectedError since wallet is connected:",
              publicKey.toString(),
            );
            return true;
          }

          console.log("WalletNotSelectedError occurred, retrying...");
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 500));
          // Recursive retry with increased attempt count
          return attemptWalletConnection(walletName, attempt + 1);
        }

        console.error("Connection error:", error);
        return false;
      }
    },
    [select, connect, signIn, connected, publicKey],
  );

  const handleWalletClick = useCallback(
    async (
      _event: React.MouseEvent<HTMLButtonElement>,
      walletName: WalletName,
    ) => {
      try {
        if (connecting) {
          console.log("Already connecting to wallet, ignoring click");
          return;
        }

        // Skip connection process if already connected
        if (connected && publicKey) {
          console.log(
            "Wallet already connected, closing modal:",
            publicKey.toString(),
          );
          hideModal();
          return;
        }

        setConnecting(true);
        setSelectedWallet(walletName);
        setConnectionAttempts((prev) => prev + 1);

        console.log("Starting connection process for wallet:", walletName);

        // Use the new connection function with retries
        const success = await attemptWalletConnection(walletName);

        // If connected or manually confirmed as success, close the modal
        if (success || (connected && publicKey)) {
          console.log(
            "Connection confirmed - Connected:",
            connected,
            "PublicKey:",
            publicKey?.toString(),
          );
          // Keep the modal open briefly so user sees success before closing
          setTimeout(() => {
            hideModal();
          }, 300);
        } else {
          setConnecting(false);
          console.log("Connection process completed without success");
        }
      } catch (error) {
        console.error("Failed in wallet click handler:", error);
        setConnecting(false);
      }
    },
    [hideModal, connecting, attemptWalletConnection, connected, publicKey],
  );

  return (
    <Dialog onOpenChange={(op: boolean) => setVisible(op)} open={visible}>
      <VisuallyHidden>
        <DialogTitle />
      </VisuallyHidden>
      <DialogContent hideCloseButton className="max-w-[496px]">
        <div className="p-3.5 border-b relative">
          <h1 className="text-xl font-satoshi font-medium tracking-[-0.018em] text-autofun-text-highlight">
            Connect Wallet
          </h1>
          <button
            onClick={hideModal}
            className="absolute top-4 right-4 text-autofun-background-disabled cursor-pointer"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="pb-3.5 px-3.5">
          <h3 className="text-xl text-center text-white font-satoshi font-medium">
            Switch to Solana to continue
          </h3>
          <div className="my-4 flex justify-center">
            <SkeletonImage
              src="/wallet-modal.png"
              width={363}
              height={133}
              alt="wallet_modal"
            />
          </div>
          {installedWallets?.length > 0 ? (
            <ul className="space-y-2 mb-4">
              {installedWallets.map((wallet) => (
                <WalletListItem
                  key={wallet.adapter.name}
                  handleClick={(event) =>
                    handleWalletClick(event, wallet.adapter.name)
                  }
                  wallet={wallet}
                />
              ))}
              {connecting && (
                <div className="text-center text-autofun-text-secondary mt-2">
                  {selectedWallet
                    ? `Connecting to ${selectedWallet}... ${connectionAttempts > 1 ? `(Attempt ${connectionAttempts})` : ""}`
                    : "Connecting..."}
                </div>
              )}
            </ul>
          ) : (
            <h3 className="select-none text-base text-center text-autofun-text-secondary">
              It doesn't seem you have an Solana wallet installed.
            </h3>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const WalletModalProvider: FC<WalletModalProviderProps> = ({
  children,
  ...props
}) => {
  const [visible, setVisible] = useState(false);
  const { isAuthenticated, isAuthenticating, authenticate, logout, authToken } =
    useWalletAuthentication();
  const [hasStoredWallet, setHasStoredWallet] = useState(false);
  const { publicKey, disconnect, connected, wallet } = useWallet();
  const { setAuthenticated } = useUser();

  // Check if there's a stored wallet in localStorage
  useEffect(() => {
    const walletConnected = localStorage.getItem("walletConnected");
    setHasStoredWallet(walletConnected === "true");
  }, []);

  // Safer disconnection handler function
  const safeDisconnect = useCallback(() => {
    // Only attempt to disconnect if we're actually connected and have a wallet selected
    if (connected && wallet) {
      try {
        console.log("Safely disconnecting wallet:", wallet.adapter.name);
        disconnect();
      } catch (err) {
        console.error("Error during safe disconnect:", err);
      }
    } else {
      console.log("No need to disconnect, wallet not fully connected");
    }
  }, [connected, wallet, disconnect]);

  // Monitor authentication state changes to handle disconnection
  useEffect(() => {
    // Only handle disconnection if not both are correct
    // (publicKey exists + not authenticated)
    if (!isAuthenticated && publicKey && !isAuthenticating) {
      console.log(
        "Auth check: not authenticated but have publicKey, waiting before decision",
      );

      // Add a timeout to avoid race conditions with auth checks
      const timeoutId = setTimeout(() => {
        // Do a fresh check of authentication state before proceeding
        // Also check connected status again to avoid unnecessary actions
        if (!connected || !publicKey) {
          console.log("Wallet no longer connected, skipping auth check");
          return;
        }

        const checkAuthAgain = async () => {
          try {
            // Check auth state directly from the server to be certain
            const response = await fetch(
              import.meta.env.VITE_API_URL + "/api/auth-status",
              {
                credentials: "include",
                headers: authToken
                  ? { Authorization: `Bearer ${authToken}` }
                  : {},
              },
            );

            // Only disconnect if we're still not authenticated
            if (response.ok) {
              const data = (await response.json()) as {
                authenticated: boolean;
              };
              console.log("Re-checking auth status before disconnect:", data);

              // Only disconnect if we're still definitely not authenticated after the delay
              if (!data.authenticated) {
                // Check if we previously had a wallet connection stored
                const hadWalletConnected =
                  localStorage.getItem("walletConnected") === "true";

                if (hadWalletConnected) {
                  console.log(
                    "Confirmed authentication lost while wallet connected, forcing disconnection",
                  );
                  // Clear localStorage immediately
                  localStorage.removeItem("walletConnected");
                  localStorage.removeItem("lastWalletName");

                  // Use the safer disconnect method
                  safeDisconnect();
                }
              } else {
                console.log(
                  "Auth check succeeded after delay, no need to disconnect",
                );
              }
            }
          } catch (e) {
            console.error("Error checking auth before disconnection:", e);
          }
        };

        checkAuthAgain();
      }, 2000); // Wait 2 seconds before making disconnection decision

      return () => clearTimeout(timeoutId);
    }
  }, [
    isAuthenticated,
    publicKey,
    safeDisconnect,
    connected,
    isAuthenticating,
    authToken,
  ]);

  // Sync wallet authentication state with user context
  useEffect(() => {
    // When wallet authentication state changes, update user context
    setAuthenticated(isAuthenticated);
    console.log("Syncing authentication state:", isAuthenticated);
  }, [isAuthenticated, setAuthenticated]);

  // Enhanced authenticate function with debounce to prevent multiple signatures
  const throttledAuthenticate = useCallback(
    async (siwsMessage: any, signature: string) => {
      try {
        // If already authenticated or authenticating, don't proceed
        if (isAuthenticated || isAuthenticating) {
          console.log("Authentication already in progress or completed");
          return;
        }

        console.log("Wallet provider handling authentication");
        try {
          await authenticate(siwsMessage, signature);
          // The authenticate function updates isAuthenticated internally
          // No need to check return value
          console.log("Authentication completed in throttledAuthenticate");
        } catch (error) {
          console.error("Authentication error in provider:", error);
          // Ensure user state is reset on authentication failure
          setAuthenticated(false);
          throw error;
        }
      } catch (error) {
        console.error("Error in throttledAuthenticate:", error);
        setAuthenticated(false);
        throw error;
      }
    },
    [authenticate, isAuthenticated, isAuthenticating, setAuthenticated],
  );

  return (
    <WalletModalContext.Provider
      value={{
        visible,
        setVisible,
        hasStoredWallet,
        authenticate: throttledAuthenticate,
        isAuthenticating,
        isAuthenticated,
        logout,
        authToken,
      }}
    >
      {children}
      {visible && <WalletModal {...props} />}
    </WalletModalContext.Provider>
  );
};

export const WalletProvider = ({
  children,
  autoConnect,
}: PropsWithChildren<{ autoConnect: boolean }>) => {
  console.log("import.meta.env.VITE_RPC_URL", import.meta.env.VITE_RPC_URL);
  return (
    <ConnectionProvider
      endpoint={import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com"}
    >
      <SolanaWalletProvider wallets={[]} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
