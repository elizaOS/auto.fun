import { CenterFormContainerProps } from "../../../../types/components/common/containers/CenterFormContainer.type";

export const CenterFormContainer = ({
  formComponent,
  header,
  submitButton,
}: CenterFormContainerProps) => {
  return (
    <div className="flex flex-col w-full m-auto gap-7 justify-center">
      <div className="h-full flex flex-col items-center justify-center max-w-4xl mx-auto w-full gap-6">
        <div className="text-left w-5/6 text-2xl">{header}</div>
        <div className="max-h-[calc(100vh-300px)] w-5/6 rounded-[20px] border-[#03ff24] border gap-[30px] flex flex-col relative overflow-hidden">
          <div className="w-full overflow-scroll p-6">{formComponent}</div>
        </div>
        {submitButton}
      </div>
    </div>
  );
};
