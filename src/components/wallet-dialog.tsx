import SkeletonImage from "@/components/skeleton-image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import useAuthentication from "@/hooks/use-authentication";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import { env } from "@/utils/env";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation } from "@tanstack/react-query";
import { Payload, SIWS } from "@web3auth/sign-in-with-solana";
import type { FC, ReactNode } from "react";
import { useCallback, useEffect, useMemo } from "react";

export interface WalletModalProviderProps {
  children: ReactNode;
  className?: string;
  container?: string;
}

export interface WalletModalProps {
  className?: string;
  container?: string;
}

export const WalletModal: FC<WalletModalProps> = () => {
  const {
    wallets,
    connecting,
    select,
    connect,
    publicKey,
    signMessage,
  } = useWallet();
  const { visible, setVisible } = useWalletModal();
  const { setAuthToken } = useAuthentication();

  // Check for previously selected wallet in localStorage when modal opens
  useEffect(() => {
    if (visible) {
      const storedWalletName = localStorage.getItem("walletName");
      if (storedWalletName) {
        // Found a previously selected wallet - parse from JSON
        const parsedWalletName = JSON.parse(storedWalletName);
        console.log("Found previously selected wallet:", parsedWalletName);
      }
    }
  }, [visible]);

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

  const mutation = useMutation({
    mutationKey: ["connect-wallet"],
    mutationFn: async ({ wallet }: { wallet: Wallet }) => {
      if (!wallet) {
        console.error("No wallet provided to connect");
        throw new Error("No wallet provided");
      }

      localStorage.setItem("walletName", JSON.stringify(wallet.adapter.name));
      console.log("Selected wallet:", wallet.adapter.name);

      // Always use adapter approach for consistency
      console.log(`Connecting to ${wallet.adapter.name} wallet...`);
      
      // Select the wallet first
      await select(wallet.adapter.name);
      
      // Wait a moment for selection to register
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Connect using the adapter
      await connect();
      console.log("Adapter connection successful");

      // Wait for the public key to be available with timeout
      const maxWaitTime = 10000; // 10 seconds max
      const startTime = Date.now();

      while (!publicKey && Date.now() - startTime < maxWaitTime) {
        console.log("Waiting for publicKey...");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!publicKey) {
        console.error("Failed to get publicKey after connection");
        throw new Error("Wallet connected but no public key available");
      }

      const publicKeyStr = publicKey.toString();
      console.log("Using publicKey for authentication:", publicKeyStr);

      /** Nonce generation */
      const nonce = String(Math.floor(new Date().getTime() / 1000.0));

      // Use adapter signing
      if (!signMessage) throw new Error("signMessage method not available");
      console.log("Using adapter signing");

      const payload = new Payload();
      payload.domain = window.location.host;
      payload.address = publicKeyStr;
      payload.uri = window.location.origin;
      payload.statement = `Sign this message for authenticating with nonce: ${nonce}`;
      payload.version = "1";
      payload.chainId = 1;
      payload.nonce = nonce;

      const siwsMessage = new SIWS({ payload });
      const messageText = siwsMessage.prepareMessage();
      const messageEncoded = new TextEncoder().encode(messageText);

      const adaptorSignature = await signMessage(messageEncoded);
      if (!(adaptorSignature instanceof Uint8Array)) {
        throw new Error("Adapter signing did not return a Uint8Array");
      }

      console.log("Message signed successfully, authenticating with server...");

      // Encode the signature for sending to the server
      const signatureHex = bs58.encode(adaptorSignature);
      console.log(
        "Successfully encoded signature to base58:",
        signatureHex.substring(0, 10) + "...",
      );

      // Prepare the authentication payload
      const authPayload = {
        publicKey: publicKeyStr,
        signature: { t: "sip99", s: signatureHex },
        payload: siwsMessage.payload,
        header: { t: "sip99" },
        nonce,
        message: messageText,
      };

      console.log("Sending authentication payload to server:", {
        publicKey: authPayload.publicKey,
        signatureType: typeof authPayload.signature,
        signatureFormat: authPayload.signature.t,
        signatureLength: authPayload.signature.s.length,
        nonceValue: authPayload.nonce,
      });

      // Use token-based authentication with Authorization header instead of cookies
      const authResponse = await fetch(`${env.apiUrl}/api/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authPayload),
        credentials: "include", // Keep for backward compatibility
      });

      if (!authResponse.ok) {
        throw new Error(`Authentication failed: ${authResponse.status}`);
      }

      // Define the expected response type
      interface AuthResponse {
        token: string;
        message: string;
        user?: {
          address: string;
        };
      }

      const authData = (await authResponse.json()) as AuthResponse;

      // Handle successful authentication
      console.log("Authentication successful, received token");

      // Store the token
      if (authData.token) {
        console.log(
          "Received authentication token from server, format:",
          authData.token.includes(".")
            ? "JWT"
            : authData.token.startsWith("wallet_")
              ? "wallet_prefix"
              : "unknown",
        );

        // Store token in both formats for compatibility
        setAuthToken(authData.token);

        // Store in enhanced walletAuth storage structure
        const authStorage = {
          token: authData.token,
          walletAddress: authData.user?.address || publicKeyStr,
          timestamp: Date.now(),
        };

        try {
          localStorage.setItem("walletAuth", JSON.stringify(authStorage));
          console.log("Stored wallet auth data with token in localStorage");
        } catch (e) {
          console.error("Error storing wallet auth data:", e);
        }
      } else {
        console.warn("No token received from server during authentication");
        throw new Error("Authentication error: No token received from server");
      }

      return true;
    },
    onSuccess: () => {
      setVisible(false);
    },
    onError: (e) => {
      console.error("Connection error:", e);
    },
  });

  const handleWalletClick = useCallback(
    (wallet: Wallet) => {
      mutation.mutate({ wallet });
    },
    [mutation],
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
            onClick={() => setVisible(false)}
            className="cursor-pointer absolute top-4 right-4 text-autofun-background-disabled cursor-pointer"
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
            Connect a Solana Wallet to Continue
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
                  handleClick={() => handleWalletClick(wallet)}
                  wallet={wallet}
                />
              ))}
              {connecting && (
                <div className="text-center text-autofun-text-secondary mt-2">
                  Connecting...
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

const WalletListItem: FC<{
  wallet: Wallet;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}> = ({ wallet, handleClick, tabIndex = 0 }) => {
  return (
    <li>
      <button
        onClick={handleClick}
        className="cursor-pointer cursor-pointer bg-autofun-background-action-primary w-full flex items-center justify-between px-4 py-3 transition-colors"
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
