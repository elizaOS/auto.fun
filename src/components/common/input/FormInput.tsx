import { FormInputProps } from "../../../../types/components/common/input/FormInput.type";

export const FormInput = ({
  label,
  leftIndicator,
  leftIndicatorOpacity,
  rightIndicator,
  rightIndicatorOpacity,
  inputTag,
  inputPad,
  variant,
  error,
  isOptional,
  ...props
}: FormInputProps) => {
  const leftIndicatorStyle =
    leftIndicatorOpacity === "full" ? "opacity-100" : "opacity-30";

  const rightIndicatorStyle =
    rightIndicatorOpacity === "full" ? "opacity-100" : "opacity-30";

  const inputPaddingStyles: Record<
    Exclude<FormInputProps["inputPad"], undefined>,
    string
  > = {
    left: "pl-4",
    right: "pr-4",
    both: "px-4",
  };

  const borderStyles: Record<
    Exclude<FormInputProps["variant"], undefined>,
    string
  > = {
    error: "border-[#F00] border-solid border-[1px]",
    default: "",
  };

  const backgroundColor: Record<
    Exclude<FormInputProps["variant"], undefined>,
    string
  > = {
    error: "bg-[rgba(255,0,0,0.15)] rounded-t-xl",
    default: "",
  };

  return (
    <div className="font-medium flex flex-col gap-3">
      {label && (
        <FormInput.Label id={props.id} label={label} isOptional={isOptional} />
      )}
      <div
        className={
          backgroundColor[variant || "default"] +
          " flex border border-[#262626] rounded-md overflow-hidden"
        }
      >
        {inputTag && (
          <div className="bg-[#262626] flex items-center py-2 px-3">
            {inputTag}
          </div>
        )}
        <div
          className={`flex items-center bg-[#0f0f0f] overflow-hidden ${borderStyles[variant || "default"]} flex-1`}
        >
          {leftIndicator && (
            <div className={`${leftIndicatorStyle} pl-3 flex justify-center`}>
              {leftIndicator}
            </div>
          )}
          <input
            className={`w-full bg-inherit h-11 ${inputPaddingStyles[inputPad || "both"]} py-4 placeholder-[#8c8c8c]`}
            {...props}
          />
          {rightIndicator && (
            <div className={`${rightIndicatorStyle} pr-3 flex justify-center`}>
              {rightIndicator}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
};

const Label = ({
  id,
  label,
  isOptional,
}: {
  id?: string;
  label: string;
  isOptional?: boolean;
}) => {
  return (
    <label htmlFor={id}>
      <span className="text-white uppercase leading-normal tracking-widest">
        {label}
      </span>
      {isOptional && (
        <span className="text-[#8c8c8c] font-semibold"> (Optional)</span>
      )}
    </label>
  );
};

FormInput.Label = Label;
