import { LaunchingToken } from "@/components/modals/LaunchingToken";
import {
  ModalState,
  ModalType,
  ModalProps,
  ExtractProps,
  ModalsDict,
} from "../../../types/zustand/stores/modalStore.type";
import { create } from "zustand";

const modals: ModalsDict = {
  [ModalType.NONE]: () => <></>,
  [ModalType.LAUNCHING_TOKEN]: LaunchingToken,
};

export const useModalStore = create<ModalState>((set) => ({
  Modal: null,
  open: false,
  changeModal: <T extends ModalType>(
    open: boolean,
    modalState: T,
    props: ExtractProps<Extract<ModalProps, { state: T }>>,
  ) => {
    set({ open, Modal: modals[modalState](props) });
  },
  setOpen: (open: boolean) => {
    set({ open });
  },
  resetModal: () =>
    set({
      open: false,
      Modal: null,
    }),
}));
