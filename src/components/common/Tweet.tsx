"use client";

export const Tweet = ({ url }: { url: string }) => {
  return (
    <button
      onClick={(e) => {
        window.open(url, "_blank");
        // prevent outer button from being clicked to view token details. kind of janky but it works
        // should ideally change designs to avoid nesting buttons like this
        e.preventDefault();
      }}
      className="p-3 bg-[#521653] rounded-xl justify-center items-center gap-2 inline-flex w-full"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 20L10.768 13.232M13.228 10.772L20 4M4 4L15.733 20H20L8.267 4H4Z"
          stroke="#F743F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="text-[#f743f6] text-base font-medium font-['Inter'] leading-normal">
        Twitter
      </div>
    </button>
  );
};
