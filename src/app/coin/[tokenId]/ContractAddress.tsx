import { useState } from "react";

const CopyIcon = () => {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.66675 6.4445C4.66675 5.97295 4.85407 5.52071 5.18751 5.18727C5.52095 4.85383 5.97319 4.6665 6.44475 4.6665H12.2221C12.4556 4.6665 12.6868 4.71249 12.9025 4.80185C13.1182 4.8912 13.3142 5.02217 13.4793 5.18727C13.6444 5.35237 13.7754 5.54838 13.8647 5.76409C13.9541 5.97981 14.0001 6.21101 14.0001 6.4445V12.2218C14.0001 12.4553 13.9541 12.6865 13.8647 12.9022C13.7754 13.118 13.6444 13.314 13.4793 13.4791C13.3142 13.6442 13.1182 13.7751 12.9025 13.8645C12.6868 13.9538 12.4556 13.9998 12.2221 13.9998H6.44475C6.21126 13.9998 5.98005 13.9538 5.76434 13.8645C5.54862 13.7751 5.35261 13.6442 5.18751 13.4791C5.02241 13.314 4.89144 13.118 4.80209 12.9022C4.71274 12.6865 4.66675 12.4553 4.66675 12.2218V6.4445Z"
        stroke="#F743F6"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.6747 11.158C2.47003 11.0417 2.2998 10.8733 2.1813 10.6699C2.0628 10.4665 2.00026 10.2354 2.00003 10V3.33333C2.00003 2.6 2.60003 2 3.33336 2H10C10.5 2 10.772 2.25667 11 2.66667"
        stroke="#F743F6"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const ContractAddress = ({ mint }: { mint: string }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mint);
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000); // Hide after 2 seconds
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="px-4 py-3 bg-[#f743f6]/10 rounded-xl flex-col justify-center items-start gap-2 inline-flex hover:bg-[#f743f6]/20 transition-colors"
      >
        <div className="self-stretch justify-between items-center inline-flex gap-4">
          <div>
            <span className="text-[#b3a0b3] text-base font-medium leading-normal">
              {mint.slice(0, 12)}...{mint.slice(-21)}
            </span>
          </div>

          <CopyIcon />
        </div>
      </button>

      {/* Tooltip */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 -top-10
          px-3 py-2 rounded-lg bg-gray-900 text-white text-sm
          transition-all duration-300
          ${showTooltip ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}
        `}
      >
        Copied!
      </div>
    </div>
  );
};
