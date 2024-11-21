import { forwardRef, useMemo } from "react";
import { RoundedButtonProps } from "../../../../types/components/common/button/RoundedButton.type";

export const RoundedButton = forwardRef<HTMLButtonElement, RoundedButtonProps>(
  ({ children, variant, color, disabled, className, ...props }, ref) => {
    const _className = useMemo(() => {
      if (variant == "outlined") {
        const border = "border-solid border-[2px]";
        switch (color) {
          case "red":
            return `border-[#FF0000] text-[#FF0000] bg-[rgba(255,0,0,0.15)] ${border}`;
          default:
            return `border-[#03ff24] text-[#03ff24] bg-[rgba(0,255,0,0.15)] ${border}`;
        }
      } else {
        switch (color) {
          case "red":
            return "text-black bg-[#FF0000]";
          default:
            return "text-black bg-[#03ff24]";
        }
      }
    }, [variant, color]);

    return (
      <button
        className={`${_className} rounded-xl font-bold ${disabled && "opacity-15"} active:brightness-75 ${className}`}
        {...props}
        ref={ref}
      >
        {children}
      </button>
    );
  },
);

RoundedButton.displayName = "RoundedButton";
