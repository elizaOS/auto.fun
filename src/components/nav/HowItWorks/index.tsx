import { useRef } from "react";
import { useOutsideClickDetection } from "@/hooks/actions/useOutsideClickDetection";
import { Description } from "./Description";

export const HowItWorks = () => {
  const descriptionRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useOutsideClickDetection([descriptionRef, buttonRef], () => {
    descriptionRef.current?.close();
  });

  // removed from designs for now
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className="text-[#33c55e] font-primary"
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
