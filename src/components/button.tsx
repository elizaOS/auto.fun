import { Loader2 } from "lucide-react";
import React from "react";
import { twMerge } from "tailwind-merge";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
}

const variantClasses = {
  primary: "bg-autofun-background-action-primary border text-white",
  secondary:
    "bg-autofun-background-action-primary border text-autofun-text-highlight",
};

const baseClasses =
  "px-4 py-2 rounded focus:outline-none transition duration-150 ease-in-out cursor-pointer font-medium";
const disabledClasses = "opacity-50 cursor-not-allowed";

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  isLoading,
  disabled,
  children,
  className,
  ...props
}) => {
  const classes = twMerge(
    baseClasses,
    variantClasses[variant],
    (disabled || isLoading) && disabledClasses,
    className
  );

  return (
    <button disabled={disabled || isLoading} className={classes} {...props}>
      {isLoading ? (
        <Loader2 className="animate-spin size-5 m-auto" />
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
