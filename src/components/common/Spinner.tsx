import React from "react";

export const Spinner = () => {
  return (
    <svg
      width="101"
      height="101"
      viewBox="0 0 101 101"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="animate-spin mb-10"
    >
      <circle
        opacity="0.25"
        cx="50.5"
        cy="50.502"
        r="42.5926"
        stroke="#262626"
        strokeWidth="14.8148"
      />
      <path
        d="M93.0934 50.5018C93.0934 74.025 74.024 93.0944 50.5008 93.0944C26.9776 93.0944 7.9082 74.025 7.9082 50.5018C7.9082 26.9785 26.9776 7.90918 50.5008 7.90918"
        stroke="url(#paint0_linear_2573_3488)"
        strokeWidth="14.8148"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_2573_3488"
          x1="50.5008"
          y1="7.90918"
          x2="93.0934"
          y2="31.9832"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2FD345" />
          <stop offset="0.518595" stopColor="#666666" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};
