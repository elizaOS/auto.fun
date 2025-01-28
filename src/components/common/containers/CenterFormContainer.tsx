import { CenterFormContainerProps } from "../../../../types/components/common/containers/CenterFormContainer.type";

export const CenterFormContainer = ({
  formComponent,
  header,
  submitButton,
}: CenterFormContainerProps) => {
  return (
    <div className="flex flex-col w-full max-w-[780px] gap-7 justify-center self-center">
      <div className="text-left text-2xl">{header || null}</div>
      <div className="w-full bg-[#171717] rounded-xl border border-[#03FF24]/15 gap-[30px] flex flex-col relative overflow-hidden">
        <div className="w-full overflow-scroll p-9">{formComponent}</div>
      </div>
      {submitButton}
    </div>
  );
};
