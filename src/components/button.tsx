import { Loader2 } from "lucide-react";
import React from "react";
import { twMerge } from "tailwind-merge";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  isLoading?: boolean;
  size?: "default" | "large" | "small";
}

const variantClasses = {
  primary: "bg-autofun-background-action-primary border text-white",
  outline: "bg-transparent border text-white",
  secondary:
    "bg-autofun-background-action-primary border text-autofun-text-highlight",
};

const sizeClasses = {
  small:
    "h-[36px] text-center justify-center text-autofun-text-primary text-sm font-medium font-satoshi leading-tight",
  default: "h-10",
  large: "h-[44px]",
};

const baseClasses =
  "px-4 py-2 rounded-md focus:outline-none transition-all duration-200 ease-in-out cursor-pointer font-medium flex items-center justify-center";
const disabledClasses = "opacity-50 cursor-not-allowed";

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "default",
  isLoading,
  disabled,
  children,
  className,
  ...props
}) => {
  const classes = twMerge(
    baseClasses,
    sizeClasses[size],
    variantClasses[variant],
    (disabled || isLoading) && disabledClasses,
    className
  );

  return (
    <button disabled={disabled || isLoading} className={classes} {...props}>
      {isLoading ? (
        <Loader2 className="animate-spin w-5 h-5 mx-auto" />
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
