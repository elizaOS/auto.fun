import { useWalletModal, WalletModalContext } from "@/hooks/use-wallet-modal";
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

// Simple wallet list item component
const WalletListItem: FC<{
  wallet: Wallet;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}> = ({ wallet, handleClick, tabIndex = 0 }) => {
  return (
    <li>
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 rounded-md transition-colors"
        tabIndex={tabIndex}
      >
        <span>{wallet.adapter.name}</span>
        {wallet.readyState === WalletReadyState.Installed && (
          <span className="text-xs text-green-500 font-medium">Installed</span>
        )}
      </button>
    </li>
  );
};

export const WalletModal: FC<WalletModalProps> = ({
  className = "",
}) => {
  const { wallets, select, signIn, connect } = useWallet();
  const { visible, setVisible } = useWalletModal();
  const [showMore, setShowMore] = useState(false);

  const [installedWallets, otherWallets] = useMemo(() => {
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
    async (_event: React.MouseEvent<HTMLButtonElement>, walletName: WalletName) => {
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
    [select, hideModal],
  );

  const toggleShowMore = useCallback(() => {
    setShowMore(!showMore);
  }, [showMore]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-black/50" onClick={hideModal}></div>
      <div className={`bg-white rounded-lg shadow-xl p-6 max-w-md w-full relative z-10 ${className}`}>
        <button 
          onClick={hideModal}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <h2 className="text-xl font-bold text-center mb-6">Connect Wallet</h2>
        
        {installedWallets.length > 0 ? (
          <>
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium">Switch to Solana to continue</h3>
              <div className="my-4 flex justify-center">
                <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M80 25H20L40 50L20 75H80L60 50L80 25Z" fill="#9945FF" />
                </svg>
              </div>
            </div>
            
            <ul className="space-y-2 mb-4">
              {installedWallets.map((wallet) => (
                <WalletListItem
                  key={wallet.adapter.name}
                  handleClick={(event) => handleWalletClick(event, wallet.adapter.name)}
                  wallet={wallet}
                />
              ))}
              
              {showMore && otherWallets.map((wallet) => (
                <WalletListItem
                  key={wallet.adapter.name}
                  handleClick={(event) => handleWalletClick(event, wallet.adapter.name)}
                  wallet={wallet}
                  tabIndex={showMore ? 0 : -1}
                />
              ))}
            </ul>
            
            {otherWallets.length > 0 && (
              <button
                onClick={toggleShowMore}
                className="w-full text-center py-2 text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <span>{showMore ? "Fewer" : "More"} options</span>
                <svg
                  width="13"
                  height="7"
                  viewBox="0 0 13 7"
                  xmlns="http://www.w3.org/2000/svg"
                  className={`inline-block ml-2 transform ${showMore ? "rotate-180" : ""} transition-transform`}
                >
                  <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" fill="currentColor" />
                </svg>
              </button>
            )}
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium">You'll need a wallet on Solana to continue</h3>
              <div className="my-6 flex justify-center">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="24" height="24" rx="4" fill="#9945FF" />
                  <path d="M17 6H7C5.89543 6 5 6.89543 5 8V16C5 17.1046 5.89543 18 7 18H17C18.1046 18 19 17.1046 19 16V8C19 6.89543 18.1046 6 17 6Z" stroke="white" strokeWidth="1.5" />
                  <path d="M19 10H15C14.4477 10 14 10.4477 14 11V13C14 13.5523 14.4477 14 15 14H19V10Z" stroke="white" strokeWidth="1.5" />
                </svg>
              </div>
            </div>
            
            {otherWallets.length > 0 && (
              <>
                <button
                  onClick={toggleShowMore}
                  className="w-full text-center py-2 text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  <span>{showMore ? "Hide" : "Already have a wallet? View"} options</span>
                  <svg
                    width="13"
                    height="7"
                    viewBox="0 0 13 7"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`inline-block ml-2 transform ${showMore ? "rotate-180" : ""} transition-transform`}
                  >
                    <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" fill="currentColor" />
                  </svg>
                </button>
                
                {showMore && (
                  <ul className="space-y-2 mt-4">
                    {otherWallets.map((wallet) => (
                      <WalletListItem
                        key={wallet.adapter.name}
                        handleClick={(event) => handleWalletClick(event, wallet.adapter.name)}
                        wallet={wallet}
                        tabIndex={showMore ? 0 : -1}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
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
