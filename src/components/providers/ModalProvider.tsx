import { useModalStore } from "@/zustand/stores/modalStore";
import { PropsWithChildren } from "react";

const Modal = () => {
  const open = useModalStore((state) => state.open);
  const Modal = useModalStore((state) => state.Modal);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed backdrop-blur-md w-full h-full"></div>
      <div className="fixed w-full h-full flex justify-center items-center">
        {Modal}
      </div>
    </>
  );
};

export const ModalProvider = ({ children }: PropsWithChildren) => {
  return (
    <>
      {children}
      <Modal />
    </>
  );
};
