import { CheckIcon } from "lucide-react";
import { MouseEventHandler, useState } from "react";

const CopyIcon = () => {
  return (
    <svg
      width="19"
      height="18"
      viewBox="0 0 19 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
    >
      <path
        d="M15.5 6.75H8.75C7.92157 6.75 7.25 7.42157 7.25 8.25V15C7.25 15.8284 7.92157 16.5 8.75 16.5H15.5C16.3284 16.5 17 15.8284 17 15V8.25C17 7.42157 16.3284 6.75 15.5 6.75Z"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.25 11.25H3.5C3.10218 11.25 2.72064 11.092 2.43934 10.8107C2.15804 10.5294 2 10.1478 2 9.75V3C2 2.60218 2.15804 2.22064 2.43934 1.93934C2.72064 1.65804 3.10218 1.5 3.5 1.5H10.25C10.6478 1.5 11.0294 1.65804 11.3107 1.93934C11.592 2.22064 11.75 2.60218 11.75 3V3.75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const CopyButton = ({ text }: { text: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyText: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <>
      {isCopied && <CheckIcon color="#2fd345" size={18} />}

      {!isCopied && (
        <button
          onClick={copyText}
          type="button"
          disabled={!text}
          className="disabled:opacity-30 text-[#8c8c8c] hover:text-white transition-colors"
        >
          <CopyIcon />
        </button>
      )}
    </>
  );
};
