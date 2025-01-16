import { LaunchingToken } from "@/components/modals/LaunchingToken";
import {
  ModalState,
  ModalType,
  ModalProps,
  ExtractProps,
  ModalsDict,
  ModalStore,
} from "../../../types/zustand/stores/modalStore.type";
import { createStore } from "zustand";

const defaultInitState: ModalState = Object.freeze({
  open: false,
  Modal: null,
});

const modals: ModalsDict = Object.freeze({
  [ModalType.NONE]: () => <></>,
  [ModalType.LAUNCHING_TOKEN]: LaunchingToken,
});

export const createModalStore = (
  initialState: ModalState = defaultInitState,
) => {
  return createStore<ModalStore>()((set) => ({
    ...initialState,
    changeModal: <T extends keyof ModalsDict>(
      open: boolean,
      modalState: T,
      props: ExtractProps<Extract<ModalProps, { state: T }>>,
    ) => {
      set({ open, Modal: modals[modalState](props) });
    },
    setOpen: (open: boolean) => {
      set({ open });
    },
    resetModal: () => set(initialState),
  }));
};
