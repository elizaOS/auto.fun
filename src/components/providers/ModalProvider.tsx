import { useModalStore } from "@/zustand/stores/modalStore";
import { PropsWithChildren } from "react";

const Modal = () => {
  const open = useModalStore((state) => state.open);
  const Modal = useModalStore((state) => state.Modal);

  if (!open) {
    return null;
  }

  return Modal;
};

export const ModalProvider = ({ children }: PropsWithChildren) => {
  return (
    <>
      {children}
      <Modal />
    </>
  );
};
