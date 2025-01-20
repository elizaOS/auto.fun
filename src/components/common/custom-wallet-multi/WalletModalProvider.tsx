import type { FC, ReactNode } from "react";
import React, { useState } from "react";
import type { WalletModalProps } from "./WalletModal";
import { WalletModal } from "./WalletModal";
import { WalletModalContext } from "./useWalletModal";

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
