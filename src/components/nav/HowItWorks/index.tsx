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
        className="text-[#5B5B5B]"
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
      <div className="absolute bottom-[-32px] left-[-190px]">
        <Description ref={descriptionRef} />
      </div>
    </div>
  );
};
