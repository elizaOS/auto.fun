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
      <div className="w-[475px] h-[330px] sm:w-screen absolute z-10 top-[64px] left-[-190px] sm:top-[128px] sm:fixed sm:left-1/2 sm:-translate-x-1/2">
        <Description ref={descriptionRef} />
      </div>
    </div>
  );
};
