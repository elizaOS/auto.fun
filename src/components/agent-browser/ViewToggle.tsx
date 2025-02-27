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
        <img
          src="/grid.svg"
          className={`w-6 h-6 transition-opacity duration-200 ${view === "grid" ? "opacity-100" : "opacity-50"}`}
          alt="Grid View"
        />
      </button>
      <button
        onClick={() => onViewChange("table")}
        className={`flex items-center justify-center w-14 h-[39px] rounded-r-lg transition-all duration-200
          ${view === "table" ? "bg-[#2E2E2E]" : "bg-[#171717] hover:bg-[#262626]"}`}
      >
        <img
          src="/list.svg"
          className={`w-6 h-6 transition-opacity duration-200 ${view === "table" ? "opacity-100" : "opacity-50"}`}
          alt="List View"
        />
      </button>
    </div>
  );
} 