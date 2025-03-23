import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { FC, MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useWalletModal } from "../hooks/use-wallet-modal";

export interface WalletModalProps {
  className?: string;
  container?: string;
}

export const WalletModal: FC<WalletModalProps> = ({
  className = "",
}) => {
  const { wallets, select, connect } = useWallet();
  const { visible, setVisible } = useWalletModal();
  const [expanded, setExpanded] = useState(false);

  const [listedWallets, collapsedWallets] = useMemo(() => {
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
    setTimeout(() => setVisible(false), 150);
  }, [setVisible]);

  const handleWalletClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, walletName: WalletName) => {
      console.log(`Selecting wallet: ${walletName}`);
      
      try {
        // Step 1: Select the wallet
        await select(walletName);
        console.log(`Wallet ${walletName} selected successfully`);
        
        // Step 2: Connect immediately after selection
        try {
          await connect();
          hideModal();
          console.log('Wallet connected successfully');
        } catch (connectError) {
          console.error("Failed to connect to wallet:", connectError);
        }
        
      } catch (error) {
        console.error("Failed to select wallet:", error);
      }
    },
    [select, connect, hideModal],
  );

  const handleCollapseClick = useCallback(
    async () => {      
      setExpanded(!expanded)
    },
    [expanded],
  );

  // Simple wallet item rendering
  const renderWalletItem = (wallet: Wallet, tabIndex?: number) => (
    <li key={wallet.adapter.name} className="flex w-full mb-2">
      <button
        onClick={(event) => handleWalletClick(event, wallet.adapter.name)}
        className="flex items-center justify-between w-full p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
        tabIndex={tabIndex ?? 0}
      >
        <div className="flex items-center">
          <img
            src={wallet.adapter.icon}
            alt={`${wallet.adapter.name} icon`}
            className="w-8 h-8 mr-3"
          />
          <div className="font-medium">{wallet.adapter.name}</div>
        </div>
        {wallet.readyState === WalletReadyState.Installed && (
          <div className="ml-2 py-1 px-2 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded-full">Installed</div>
        )}
      </button>
    </li>
  );

  // If not visible, don't render anything
  if (!visible) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={hideModal} />
      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden">
          <button
            onClick={hideModal}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" className="fill-current">
              <path d="M14 12.461 8.3 6.772l5.234-5.233L12.006 0 6.772 5.234 1.54 0 0 1.539l5.234 5.233L0 12.006l1.539 1.538L6.772 8.3l5.69 5.7L14 12.461z" />
            </svg>
          </button>

          <div className="p-6">
            {listedWallets.length ? (
              <>
                <ul className="space-y-2 mb-4">
                  {listedWallets.map((wallet) => renderWalletItem(wallet))}
                  
                  {expanded && collapsedWallets.length > 0 && (
                    collapsedWallets.map((wallet) => 
                      renderWalletItem(wallet, expanded ? 0 : -1)
                    )
                  )}
                </ul>
                
                {collapsedWallets.length > 0 && (
                  <button
                    className="flex items-center justify-center w-full py-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors duration-200"
                    onClick={handleCollapseClick}
                    tabIndex={0}
                  >
                    <span>{expanded ? "Less " : "More "}options</span>
                    <svg
                      width="13"
                      height="7"
                      viewBox="0 0 13 7"
                      xmlns="http://www.w3.org/2000/svg"
                      className={`ml-2 fill-current ${expanded ? "rotate-180" : ""} transform transition-transform duration-200`}
                      >
                        <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" />
                      </svg>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-center mb-6 dark:text-white">
                    You&apos;ll need a wallet on Solana to continue
                  </h1>
                  <div className="flex justify-center mb-6">
                    <div className="p-4">
                      <svg width="96" height="96" fill="none" viewBox="0 0 96 96">
                        <circle cx="48" cy="48" r="48" fill="#512DA8" opacity="0.1" />
                        <path d="M44 30C44 27.7909 45.7909 26 48 26H56C58.2091 26 60 27.7909 60 30V35.5C60 37.7091 61.7909 39.5 64 39.5H68C70.2091 39.5 72 41.2909 72 43.5V66C72 68.2091 70.2091 70 68 70H28C25.7909 70 24 68.2091 24 66V43.5C24 41.2909 25.7909 39.5 28 39.5H32C34.2091 39.5 36 37.7091 36 35.5V30Z" fill="#512DA8" />
                      </svg>
                    </div>
                  </div>
                  
                  {collapsedWallets.length > 0 && (
                    <>
                      <button
                        className="flex items-center justify-center w-full py-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors duration-200"
                        onClick={handleCollapseClick}
                        tabIndex={0}
                      >
                        <span>
                          {expanded ? "Hide " : "Already have a wallet? View "}
                          options
                        </span>
                        <svg
                          width="13"
                          height="7"
                          viewBox="0 0 13 7"
                          xmlns="http://www.w3.org/2000/svg"
                          className={`ml-2 fill-current ${expanded ? "rotate-180" : ""} transform transition-transform duration-200`}
                        >
                          <path d="M0.71418 1.626L5.83323 6.26188C5.91574 6.33657 6.0181 6.39652 6.13327 6.43762C6.24844 6.47872 6.37371 6.5 6.50048 6.5C6.62725 6.5 6.75252 6.47872 6.8677 6.43762C6.98287 6.39652 7.08523 6.33657 7.16774 6.26188L12.2868 1.626C12.7753 1.1835 12.3703 0.5 11.6195 0.5H1.37997C0.629216 0.5 0.224175 1.1835 0.71418 1.626Z" />
                        </svg>
                      </button>
                      
                      {expanded && (
                        <ul className="space-y-2 mt-4">
                          {collapsedWallets.map((wallet) => 
                            renderWalletItem(wallet, expanded ? 0 : -1)
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
  