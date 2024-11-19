import { InputErrorProps } from "../../../../types/components/common/input/InputError.type";
import { TbExclamationMark } from "react-icons/tb";

export const InputError = ({ message }: InputErrorProps) => {
  return (
    <div className="flex bg-[#FFD9D9] rounded-b-xl px-4 py-3 items-center justify-between">
      <p className="text-red-500 font-medium text-[13px]">{message}</p>
      <TbExclamationMark
        className="bg-red-500 rounded-full"
        size={15}
        color={"white"}
      />
    </div>
  );
};
