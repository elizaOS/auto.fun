import React from "react";

export const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center">
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mb-3"
    >
      <rect width="36" height="36" rx="18" fill="#002605" />
      <path
        d="M11.3333 22.1667V23.8334C11.3333 24.2754 11.5089 24.6993 11.8215 25.0119C12.134 25.3244 12.558 25.5 13 25.5H23C23.442 25.5 23.8659 25.3244 24.1785 25.0119C24.4911 24.6993 24.6667 24.2754 24.6667 23.8334V22.1667M13.8333 15.5L18 11.3334M18 11.3334L22.1667 15.5M18 11.3334V21.3334"
        stroke="#03ff24"
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>

    <div className="text-[#03FF2466] text-base font-medium leading-tight mb-1">
      Upload a cover
    </div>

    <div className="text-[#03FF2466] text-[13px] font-medium leading-none">
      JPG, PNG, GIF, or MP4. Max file size: 4MB
    </div>
  </div>
);
