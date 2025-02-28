import { LayoutGrid, List } from "lucide-react";

export function ViewToggle({ view, onViewChange }: { 
  view: "grid" | "table", 
  onViewChange: (view: "grid" | "table") => void 
}) {
  return (
    <div className="flex-shrink-0 flex items-center h-10 bg-[#171717] rounded-lg">
      <button
        onClick={() => onViewChange("grid")}
        className={`flex items-center justify-center w-14 h-[39px] rounded-l-lg transition-all duration-200
          ${view === "grid" ? "bg-[#2E2E2E]" : "bg-[#171717] hover:bg-[#262626]"}`}
      >
        <LayoutGrid 
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