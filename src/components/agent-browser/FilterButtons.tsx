export function FilterButtons({ sortBy, onSortChange }: {
  sortBy: string,
  onSortChange: (sort: "all" | "marketcap") => void
}) {
  return (
    <div className="flex gap-2 flex-shrink-0">
      <button
        onClick={() => onSortChange("all")}
        className={`px-4 py-2 rounded-lg transition-all duration-200
          ${sortBy === "all" ? "bg-[#2E2E2E] text-[#2FD345]" : "bg-[#171717] text-white hover:bg-[#262626]"}`}
      >
        All
      </button>
      <button
        onClick={() => onSortChange("marketcap")}
        className={`px-4 py-2 rounded-lg transition-all duration-200
          ${sortBy === "marketcap" ? "bg-[#2E2E2E] text-[#2FD345]" : "bg-[#171717] text-white hover:bg-[#262626]"}`}
      >
        Market Cap
      </button>
    </div>
  );
} 