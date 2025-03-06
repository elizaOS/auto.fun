import { FormTextAreaProps } from "../../../../types/components/common/input/FormTextArea.type";
import TextareaAutosize from "react-textarea-autosize";

export const FormTextArea = ({
  label,
  rightIndicator,
  rightIndicatorOpacity,
  rightHeaderIndicator,
  children,
  ...props
}: FormTextAreaProps) => {
  const indicatorStyles =
    rightIndicatorOpacity === "full" ? "opacity-100" : "opacity-30";

  return (
    <div className="font-medium flex flex-col gap-3 ">
      <div className="flex justify-between">
        <label className="text-white uppercase leading-normal tracking-widest">
          {label}
        </label>
        {rightHeaderIndicator}
      </div>
      <div
        className={`flex flex-col items-center rounded-md bg-[#0f0f0f] overflow-hidden relative`}
      >
        <TextareaAutosize
          className={`w-full bg-inherit h-11 py-3 px-4 resize-none placeholder-[#8c8c8c]`}
          {...props}
        />
        {children}
        {rightIndicator && (
          <div
            className={`${indicatorStyles} pr-3 rounded-b-xl w-full flex justify-end pb-3`}
          >
            {rightIndicator}
          </div>
        )}
      </div>
    </div>
  );
};
