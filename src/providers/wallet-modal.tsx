import type { FC, ReactNode } from "react";
import { useState } from "react";
import type { WalletModalProps } from "../components/wallet-modal";
import { WalletModal } from "../components/wallet-modal";
import { WalletModalContext } from "../hooks/use-wallet-modal";

export interface WalletModalProviderProps extends WalletModalProps {
  children: ReactNode;
}

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
