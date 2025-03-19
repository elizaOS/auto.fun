import { PropsWithChildren } from "react";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export const LoadingModal = ({
  isOpen,
  children,
}: PropsWithChildren<{ isOpen: boolean }>) => {
  return (
    <Modal
      isOpen={isOpen}
      allowClose={false}
      contentClassName="w-full !p-10"
      className="!max-w-[465px]"
    >
      <Spinner />
      <div className="text-[#2fd345] text-2xl font-medium font-satoshi leading-loose mb-3.5">
        {children}
      </div>
    </Modal>
  );
};
