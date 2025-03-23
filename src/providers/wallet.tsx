import SkeletonImage from "@/components/skeleton-image";
import {
  Dialog,
  DialogContent,
  DialogTitle
} from "@/components/ui/dialog";
import { useWalletModal, WalletModalContext } from "@/hooks/use-wallet-modal";
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
import { PropsWithChildren, useCallback, useMemo, useState } from "react";

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
        className="cursor-pointer rounded-md bg-autofun-background-action-primary w-full flex items-center justify-between px-4 py-3 transition-colors"
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
  const { visible, setVisible } = useWalletModal();

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
  }, [setVisible]);

  const handleWalletClick = useCallback(
    async (
      _event: React.MouseEvent<HTMLButtonElement>,
      walletName: WalletName
    ) => {
      try {
        await select(walletName);
        try {
          if (signIn) {
            console.log("signIn exists");
            await signIn();
          } else {
            await connect();
          }
          hideModal();
          console.log("Wallet connected successfully");
        } catch (connectError) {
          console.error("Failed to connect to wallet:", connectError);
        }
      } catch (error) {
        console.error("Failed to select wallet:", error);
      }
    },
    [select, hideModal]
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

  return (
    <WalletModalContext.Provider
      value={{
        visible,
        setVisible,
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
  return (
    <ConnectionProvider endpoint={import.meta.env.VITE_RPC_URL}>
      <SolanaWalletProvider wallets={[]} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
