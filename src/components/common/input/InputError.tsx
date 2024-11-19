import { InputErrorProps } from "../../../../types/components/common/input/InputError.type";
import { TbExclamationMark } from "react-icons/tb";

export const InputError = ({ message }: InputErrorProps) => {
  return (
    <div className="flex bg-[rgba(255,0,0,0.15)] rounded-b-xl px-4 py-3 items-center justify-between">
      <p className="text-[#F00] font-medium text-[13px]">{message}</p>
      <TbExclamationMark
        className="bg-[#F00] rounded-full"
        size={15}
        color={"black"}
      />
    </div>
  );
};
