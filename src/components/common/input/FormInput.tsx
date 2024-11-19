import { FormInputProps } from "../../../../types/components/common/input/FormInput.type";

export const FormInput = ({
  label,
  leftIndicator,
  rightIndicator,
  ...props
}: FormInputProps) => {
  const indicatorStyles = "text-black opacity-30";

  return (
    <div className="flex flex-col gap-3">
      <label className="text-[#666666]">{label}</label>
      <div className="flex items-center bg-[#F1F1F1] rounded-xl overflow-hidden">
        {leftIndicator && (
          <p className={`${indicatorStyles} pl-3`}>{leftIndicator}</p>
        )}
        <input
          className="w-full text-black bg-inherit h-11 px-3 py-4"
          {...props}
        />
        {rightIndicator && (
          <p className={`${indicatorStyles} pr-3`}>{rightIndicator}</p>
        )}
      </div>
    </div>
  );
};
