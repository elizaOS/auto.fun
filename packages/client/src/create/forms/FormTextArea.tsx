import React from "react";

export interface FormTextAreaProps {
  label?: string;
  rightIndicator?: React.ReactNode;
  minRows?: number;
  maxLength?: number;
  onClick?: () => void;
  isLoading?: boolean;
  [key: string]: any;
}
export const FormTextArea = ({
  label,
  rightIndicator,
  minRows = 3,
  maxLength,
  onClick,
  isLoading,
  error,
  ...props
}: FormTextAreaProps) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2">
        {isLoading && (
          <div className="w-4 h-4 border-2 border-[#03FF24] border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>
      <div className="relative">
        <textarea
          className="w-full bg-[#0F0F0F] h-[100px] p-3 border border-neutral-800 text-white resize-none"
          style={{ minHeight: `${minRows * 1.5}rem` }}
          maxLength={maxLength}
          {...props}
          onFocus={(e) => {
            if (props.onFocus) props.onFocus(e);
          }}
          onBlur={(e) => {
            if (props.onBlur) props.onBlur(e);
          }}
        />
        {rightIndicator && (
          <div className="absolute right-3 bottom-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
    </div>
  );
};
