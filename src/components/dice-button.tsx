import { Icons } from "./icons";

interface DiceButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  className?: string;
}

export const DiceButton = ({ onClick, isLoading, className = "" }: DiceButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`bg-[#2fd345] p-2 rounded-full hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333] ${className}`}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <Icons.Dice className="w-5 h-5 text-black" />
      )}
    </button>
  );
}; 