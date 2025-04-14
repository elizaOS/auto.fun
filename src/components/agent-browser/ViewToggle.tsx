import { List } from "lucide-react";

export const GridIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      width="24"
      height="23"
      viewBox="0 0 24 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      stroke="currentColor"
    >
      <path
        d="M9 21.0833H15C20 21.0833 22 19.1666 22 14.375V8.62496C22 3.83329 20 1.91663 15 1.91663H9C4 1.91663 2 3.83329 2 8.62496V14.375C2 19.1666 4 21.0833 9 21.0833Z"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.02979 8.14587H21.9998"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.02979 14.8541H21.9998"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.50977 21.0738V1.92627"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5098 21.0738V1.92627"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export function ViewToggle({
  view,
  onViewChange,
}: {
  view: "grid" | "table";
  onViewChange: (view: "grid" | "table") => void;
}) {
  return (
    <div className="flex-shrink-0 flex items-center h-10 bg-[#171717] rounded-lg">
      <button
        onClick={() => onViewChange("grid")}
        className={`flex items-center justify-center w-14 h-[39px] rounded-l-lg transition-all duration-200
          ${view === "grid" ? "bg-[#2E2E2E]" : "bg-[#171717] hover:bg-[#262626]"}`}
      >
        <GridIcon
          className={`w-5 h-5 transition-colors duration-200 
          ${view === "grid" ? "text-white" : "text-[#8C8C8C]"}`}
        />
      </button>
      <button
        onClick={() => onViewChange("table")}
        className={`flex items-center justify-center w-14 h-[39px] rounded-r-lg transition-all duration-200
          ${view === "table" ? "bg-[#2E2E2E]" : "bg-[#171717] hover:bg-[#262626]"}`}
      >
        <List
          className={`w-5 h-5 transition-colors duration-200 
          ${view === "table" ? "text-white" : "text-[#8C8C8C]"}`}
        />
      </button>
    </div>
  );
}
