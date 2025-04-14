import { Icons } from "./icons";

interface DiceButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  className?: string;
}

export const DiceButton = ({
  onClick,
  isLoading,
  className = "",
}: DiceButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`cursor-pointer opacity-50 hover:opacity-100 ${className}`}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <Icons.Dice />
      )}
    </button>
  );
};
