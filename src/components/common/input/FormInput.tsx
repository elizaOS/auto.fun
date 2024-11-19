import { FormInputProps } from "../../../../types/components/common/input/FormInput.type";

export const FormInput = ({
  label,
  leftIndicator,
  rightIndicator,
  inputPad,
  border,
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
    Exclude<FormInputProps["border"], undefined>,
    string
  > = {
    red: "border-red-500 border-solid border-[1px]",
    none: "",
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-[#666666] text-[16px]">{label}</label>
      <div
        className={`flex items-center bg-[#F1F1F1] rounded-xl overflow-hidden ${borderStyles[border || "none"]}`}
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
  );
};
