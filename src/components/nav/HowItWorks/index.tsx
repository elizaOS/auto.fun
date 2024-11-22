import { useRef } from "react";
import { Description } from "./Description";
import { useOutsideClickDetection } from "@/hooks/actions/useOutsideClickDetection";

export const HowItWorks = () => {
  const descriptionRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useOutsideClickDetection([descriptionRef, buttonRef], () => {
    descriptionRef.current?.close();
  });

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          if (descriptionRef.current?.open) {
            descriptionRef.current?.close();
          } else {
            descriptionRef.current?.show();
          }
        }}
      >
        How it works?
      </button>
      <Description ref={descriptionRef} />
    </div>
  );
};
