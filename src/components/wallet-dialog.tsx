import SkeletonImage from "@/components/skeleton-image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation } from "@tanstack/react-query";
import type { FC, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Payload, SIWS } from "@web3auth/sign-in-with-solana";
import useAuthentication from "@/hooks/use-authentication";
import { env } from "@/utils/env";

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
  const { setAuthToken } = useAuthentication();

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

        // Different handling based on current wallet state
        if (!connectedWallet) {
          console.log(
            "No wallet currently connected, doing full selection process",
          );
          await select(wallet.adapter.name);

          // Wait longer for selection to complete when starting from null
          await new Promise((resolve) => setTimeout(resolve, 800));

          try {
            await connect();
          } catch (connectError: any) {
            console.error("Connect error:", connectError);

            // If we get a WalletNotSelectedError, try again with a longer delay
            if (connectError.name === "WalletNotSelectedError") {
              console.log(
                "Got WalletNotSelectedError, retrying selection with longer delay",
              );
              await select(wallet.adapter.name);
              await new Promise((resolve) => setTimeout(resolve, 1200));
              await connect();
            } else {
              throw connectError;
            }
          }
        } else if (connectedWallet.adapter.name === wallet.adapter.name) {
        } else {
          await select(wallet.adapter.name);
          await new Promise((resolve) => setTimeout(resolve, 300));
          await connect();
        }

        // Wait for the public key to be available
        let retries = 0;
        while (!publicKey && retries < 5) {
          console.log("Waiting for publicKey, attempt:", retries + 1);
          await new Promise((resolve) => setTimeout(resolve, 500));
          retries++;
        }

        if (!publicKey) {
          console.error("Failed to get publicKey after connection");
          throw new Error("Wallet connected but no public key available");
        }

        console.log(
          "Successfully connected with publicKey:",
          publicKey.toString(),
        );

        /** Nonce generation */
        const nonce = String(Math.floor(new Date().getTime() / 1000.0));

        if (!signMessage) throw new Error("signMessage method not available");

        const payload = new Payload();
        payload.domain = window.location.host;
        payload.address = publicKey.toString();
        payload.uri = window.location.origin;
        payload.statement = `Sign this message for authenticating with nonce: ${nonce}`;
        payload.version = "1";
        payload.chainId = 1;
        payload.nonce = nonce;

        const siwsMessage = new SIWS({ payload });

        const messageText = siwsMessage.prepareMessage();
        const messageEncoded = new TextEncoder().encode(messageText);

        const signatureBytes = await signMessage(messageEncoded);

        const signatureHex = bs58.encode(signatureBytes);
        const authResponse = await fetch(`${env.apiUrl}/api/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            publicKey: publicKey.toString(),
            signature: { t: "sip99", s: signatureHex },
            payload: siwsMessage.payload,
            header: { t: "sip99" },
            nonce,
            message: messageText,
          }),
          credentials: "include", // Important for cookies
        });

        if (!authResponse.ok) {
          throw new Error(`Authentication failed: ${authResponse.status}`);
        }

        const authData = (await authResponse.json()) as { token?: string };

        if (authData.token) {
          setAuthToken(authData.token);
        } else {
          console.warn("Authentication successful but no token received");

          const authCheckResponse = await fetch(
            `${env.apiUrl}/api/auth-status`,
            { credentials: "include" },
          );

          if (authCheckResponse.ok) {
            const statusData = (await authCheckResponse.json()) as {
              authenticated: boolean;
            };
            if (statusData.authenticated) {
              const syntheticToken = `session_${publicKey.toString()}_${Date.now()}`;
              setAuthToken(syntheticToken);
            }
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
      // TODO - Replace for proper toaster again
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
