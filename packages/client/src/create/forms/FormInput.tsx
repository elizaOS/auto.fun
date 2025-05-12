import React from "react";
export interface FormInputProps {
  label?: string;
  isOptional?: boolean;
  error?: string;
  leftIndicator?: React.ReactNode;
  rightIndicator?: React.ReactNode;
  inputTag?: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  [key: string]: any;
}
export const FormInput = ({
  label,
  isOptional,
  error,
  leftIndicator,
  rightIndicator,
  inputTag,
  onClick,
  isLoading,
  ...props
}: FormInputProps) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between gap-2">
        {label && (
          <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
            {label}
          </div>
        )}
      </div>
      <div className="relative flex items-center">
        {inputTag && (
          <div className="bg-[#262626] flex items-center h-full px-3">
            {inputTag}
          </div>
        )}
        {leftIndicator && (
          <div className="absolute left-3 text-[#8c8c8c]">{leftIndicator}</div>
        )}
        <input
          className={`w-full bg-[#0F0F0F] py-2.5 px-3 border border-neutral-800 text-white ${
            inputTag ? "pl-2" : ""
          } ${leftIndicator ? "pl-10" : ""}`}
          {...props}
        />
        {rightIndicator && (
          <div className="absolute right-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
};
