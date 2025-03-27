import { create } from "zustand";

interface WalletModalState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const useWalletModal = create<WalletModalState>(
  (set: (partial: Partial<WalletModalState>) => void) => ({
    visible: false,
    setVisible: (visible: boolean) => set({ visible }),
  })
);
