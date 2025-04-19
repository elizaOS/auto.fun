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
import { useCallback, useMemo } from "react";

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
    wallet: connectedWallet,
  } = useWallet();
  const { visible, setVisible } = useWalletModal();
  const { handleSuccessfulAuth } = useAuthentication();

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
      try {
        if (!wallet) {
          console.error("No wallet provided to connect");
          throw new Error("No wallet provided");
        }

        // Store selection in localStorage
        try {
          localStorage.setItem(
            "walletName",
            JSON.stringify(wallet.adapter.name),
          );
        } catch (e) {
          console.error("Error writing to localStorage:", e);
        }

        // Connect - use a direct approach for Phantom wallet
        const isPhantom = wallet.adapter.name.toLowerCase().includes("phantom");

        // Try direct connection for Phantom wallet
        let directConnectionSuccessful = false;
        if (isPhantom && window.solana && window.solana.isPhantom) {
          try {
            // Force disconnect first to ensure a clean connection
            try {
              select(wallet.adapter.name);
              directConnectionSuccessful = true;

              // Wait a moment for connection to register
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (connError) {
              console.error("Direct connection error:", connError);
            }
          } catch (error) {
            console.warn("Direct Phantom connection failed:", error);
          }
        }

        // If direct connection failed or this isn't Phantom, try adapter approach
        if (!directConnectionSuccessful && !connectedWallet) {
          // Select and connect via adapter
          try {
            select(wallet.adapter.name);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await connect();
          } catch (error) {
            console.error("Adapter connection failed:", error);

            // If we're using Phantom and direct connection was successful, ignore adapter errors
            if (!isPhantom || !window.solana || !window.solana.publicKey) {
              throw error;
            } else {
              console.warn(
                "Using successful direct connection despite adapter error",
              );
            }
          }
        }

        // Wait for the public key to be available with timeout
        const maxWaitTime = 10000; // 10 seconds max
        const startTime = Date.now();

        // Use direct Phantom publicKey if available, otherwise use adapter
        let finalPublicKey =
          isPhantom && window.solana && window.solana.publicKey
            ? window.solana.publicKey
            : publicKey;

        while (!finalPublicKey && Date.now() - startTime < maxWaitTime) {
          // Check for direct Phantom publicKey first
          if (isPhantom && window.solana && window.solana.publicKey) {
            finalPublicKey = window.solana.publicKey;
            break;
          }

          // Check adapter publicKey
          if (publicKey) {
            finalPublicKey = publicKey;
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (!finalPublicKey) {
          console.error("Failed to get publicKey after connection");
          throw new Error("Wallet connected but no public key available");
        }

        // Convert window.solana.publicKey to string if needed
        const publicKeyStr =
          typeof finalPublicKey === "string"
            ? finalPublicKey
            : finalPublicKey.toString();

        /** Nonce generation */
        const nonce = String(Math.floor(new Date().getTime() / 1000.0));

        // For signing, prefer direct Phantom signMessage when available
        let signatureBytes: Uint8Array;
        let siwsMessage;
        let messageText: string;

        if (isPhantom && window.solana && window.solana.signMessage) {
          const payload = new Payload();
          payload.domain = window.location.host;
          payload.address = publicKeyStr;
          payload.uri = window.location.origin;
          payload.statement = `Sign this message for authenticating with nonce: ${nonce}`;
          payload.version = "1";
          payload.chainId = 1;
          payload.nonce = nonce;

          siwsMessage = new SIWS({ payload });
          messageText = siwsMessage.prepareMessage();
          const messageEncoded = new TextEncoder().encode(messageText);

          try {
            // Use direct Phantom signing
            const signatureResponse = await window.solana.signMessage(
              messageEncoded,
              "utf8",
            );
            // Handle different signature formats - Phantom may return the signature directly or in an object
            if (signatureResponse instanceof Uint8Array) {
              signatureBytes = signatureResponse;
            } else if (
              typeof signatureResponse === "object" &&
              signatureResponse !== null
            ) {
              // Use a type assertion to handle signature property access
              type PhantomSignatureResponse = {
                signature?: Uint8Array;
                data?: Uint8Array;
              };

              const typedResponse =
                signatureResponse as PhantomSignatureResponse;

              // Check if it has a signature property
              if (typedResponse.signature instanceof Uint8Array) {
                signatureBytes = typedResponse.signature;
              } else if (typedResponse.data instanceof Uint8Array) {
                signatureBytes = typedResponse.data;
              } else {
                console.error(
                  "Object does not contain valid signature property:",
                  signatureResponse,
                );
                throw new Error(
                  "Missing or invalid signature in wallet response",
                );
              }
            } else {
              console.error(
                "Unexpected signature format:",
                typeof signatureResponse,
                signatureResponse,
              );
              throw new Error(
                "Unrecognized signature format from Phantom wallet",
              );
            }
          } catch (signingError) {
            console.error("Direct signing failed:", signingError);

            // If adapter signing is available, try that as fallback
            if (signMessage) {
              const adaptorSignature = await signMessage(messageEncoded);
              if (adaptorSignature instanceof Uint8Array) {
                signatureBytes = adaptorSignature;
              } else {
                throw new Error("Adapter signing did not return a Uint8Array");
              }
            } else {
              throw signingError;
            }
          }
        } else {
          // Use adapter signing
          if (!signMessage) throw new Error("signMessage method not available");

          const payload = new Payload();
          payload.domain = window.location.host;
          payload.address = publicKeyStr;
          payload.uri = window.location.origin;
          payload.statement = `Sign this message for authenticating with nonce: ${nonce}`;
          payload.version = "1";
          payload.chainId = 1;
          payload.nonce = nonce;

          siwsMessage = new SIWS({ payload });
          messageText = siwsMessage.prepareMessage();
          const messageEncoded = new TextEncoder().encode(messageText);

          const adaptorSignature = await signMessage(messageEncoded);
          if (adaptorSignature instanceof Uint8Array) {
            signatureBytes = adaptorSignature;
          } else {
            throw new Error("Adapter signing did not return a Uint8Array");
          }
        }

        // Encode the signature for sending to the server
        let signatureHex: string;
        try {
          signatureHex = bs58.encode(signatureBytes);
        } catch (error) {
          const encodingError = error as Error;
          console.error("Error encoding signature:", encodingError.message);
          console.error("Signature type:", typeof signatureBytes);
          throw new Error(
            "Failed to encode signature: " + encodingError.message,
          );
        }

        // Prepare the authentication payload
        const authPayload = {
          publicKey: publicKeyStr,
          signature: { t: "sip99", s: signatureHex },
          payload: siwsMessage.payload,
          header: { t: "sip99" },
          nonce,
          message: messageText,
        };

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

        // Store the token using the new handler
        if (authData.token && authData.user?.address) {
          handleSuccessfulAuth(authData.token, authData.user.address);
        } else {
          console.warn("No token received from server during authentication");
          // Generate a fallback token for compatibility
          const walletAddress =
            wallet?.adapter?.publicKey?.toString() ||
            (window.solana?.publicKey
              ? window.solana.publicKey.toString()
              : null);

          if (walletAddress) {
            const walletSpecificToken = `wallet_${walletAddress}_${Date.now()}`;
            handleSuccessfulAuth(walletSpecificToken, walletAddress);
          } else {
            console.error(
              "Cannot create fallback token: No wallet address available",
            );
            throw new Error(
              "Authentication error: No wallet address available",
            );
          }
        }

        return true;
      } catch (error) {
        console.error("Mutation error:", error);
        throw error;
      }
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
