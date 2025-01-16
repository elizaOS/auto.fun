"use client";

import { PropsWithChildren } from "react";
import { createContext, useRef, useContext } from "react";
import { useStore } from "zustand";
import { createModalStore } from "../../zustand/stores/modalStore";
import { ModalStore } from "../../../types/zustand/stores/modalStore.type";

type ModalStoreApi = ReturnType<typeof createModalStore>;

// create context to avoid a global state which can cause issues with SSR
export const ModalStoreContext = createContext<ModalStoreApi | undefined>(
  undefined,
);

export const useModalStore = <T,>(selector: (store: ModalStore) => T): T => {
  const modalStoreContext = useContext(ModalStoreContext);

  if (!modalStoreContext) {
    throw new Error(`useModalStore must be used within ModalProvider`);
  }

  return useStore(modalStoreContext, selector);
};

export const ModalProvider = ({ children }: PropsWithChildren) => {
  const storeRef = useRef<ModalStoreApi>();
  if (!storeRef.current) {
    storeRef.current = createModalStore();
  }

  return (
    <ModalStoreContext.Provider value={storeRef.current}>
      {children}
      <Modal />
    </ModalStoreContext.Provider>
  );
};

const Modal = () => {
  const open = useModalStore((state) => state.open);
  const ModalComponent = useModalStore((state) => state.Modal);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed backdrop-blur-md w-full h-full"></div>
      <div className="fixed w-full h-full flex justify-center items-center">
        {ModalComponent}
      </div>
    </>
  );
};
