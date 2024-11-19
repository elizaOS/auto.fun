import { FormInputProps } from "../../../../types/components/common/input/FormInput.type";

export const FormInput = ({
  label,
  leftIndicator,
  rightIndicator,
  inputPad,
  variant,
  ...props
}: FormInputProps) => {
  const indicatorStyles = "text-black opacity-30";
  const inputPaddingStyles: Record<
    Exclude<FormInputProps["inputPad"], undefined>,
    string
  > = {
    left: "pl-3",
    right: "pr-3",
    both: "px-3",
  };

  const borderStyles: Record<
    Exclude<FormInputProps["variant"], undefined>,
    string
  > = {
    error: "border-red-500 border-solid border-[1px]",
    default: "",
  };

  const backgroundColor: Record<
    Exclude<FormInputProps["variant"], undefined>,
    string
  > = {
    error: "bg-[#FFD9D9] rounded-t-xl",
    default: "",
  };

  return (
    <div className="flex flex-col gap-3 ">
      <label className="text-[#666666] text-[16px]">{label}</label>
      <div className={backgroundColor[variant || "default"]}>
        <div
          className={`flex items-center bg-[#F1F1F1] rounded-xl overflow-hidden ${borderStyles[variant || "default"]}`}
        >
          {leftIndicator && (
            <div className={`${indicatorStyles} pl-3`}>{leftIndicator}</div>
          )}
          <input
            className={`w-full text-black bg-inherit h-11 ${inputPaddingStyles[inputPad || "both"]} py-4`}
            {...props}
          />
          {rightIndicator && (
            <div className={`${indicatorStyles} pr-3`}>{rightIndicator}</div>
          )}
        </div>
      </div>
    </div>
  );
};
