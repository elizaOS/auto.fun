import { useMemo } from "react";
import { RoundedButtonProps } from "../../../../types/components/common/button/RoundedButton.type";

export const RoundedButton = ({
  children,
  variant,
  color,
  disabled,
  className,
  ...props
}: RoundedButtonProps) => {
  const _className = useMemo(() => {
    if (variant == "outlined") {
      const border = "border-solid border-[1px]";
      switch (color) {
        case "red":
          return `border-red-600 text-[#F20000] ${border}`;
        case "green":
          return `border-green-600 text-green-600 ${border}`;
        default:
          return `border-white text-white ${border}`;
      }
    } else {
      switch (color) {
        case "red":
          return "text-red-600 bg-[#FFD9D9]";
        case "green":
          return "text-green bg-[#01C167]";
        default:
          return "text-white bg-black";
      }
    }
  }, [variant, color]);

  console.log(className);

  return (
    <button
      className={`${_className} rounded-xl font-bold ${disabled && "opacity-15"} active:brightness-75 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
