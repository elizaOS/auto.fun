import { CenterFormContainerProps } from "../../../../types/components/common/containers/CenterFormContainer.type";

export const CenterFormContainer = ({
  formComponent,
  header,
  description,
  submitButton,
  borderless,
}: CenterFormContainerProps) => {
  return (
    <div className="flex flex-col w-full max-w-[780px] gap-7 justify-center self-center">
      <div
        className={`w-full bg-[#171717] ${!borderless && "rounded-md border border-[#262626]"} gap-[30px] flex flex-col relative overflow-hidden`}
      >
        <div className="w-full overflow-scroll py-5 px-4">
          {header && (
            <div className="text-[#2fd345] text-[32px] font-medium leading-9 mb-3 font-satoshi">
              {header}
            </div>
          )}
          {description && (
            <div className="text-[#8c8c8c] text-lg font-normal leading-relaxed mb-5">
              {description}
            </div>
          )}
          {formComponent}
        </div>
      </div>
      {submitButton}
    </div>
  );
};
