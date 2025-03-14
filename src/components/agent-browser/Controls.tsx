import { ViewToggle } from "./ViewToggle";
import { ChevronUp, ChevronDown } from "lucide-react";

interface ControlsProps {
  view: "grid" | "table";
  sortBy: string;
  sortOrder: "asc" | "desc";
  onViewChange: (view: "grid" | "table") => void;
  onSortByChange: (sortBy: string) => void;
  onSortOrderChange: (order: "asc" | "desc") => void;
}

const SORT_OPTIONS = [
  { value: "featured", label: "All" },
  { value: "name", label: "Name" },
  { value: "marketCapUSD", label: "Market Cap" },
  { value: "volume24h", label: "24h Volume" },
  { value: "holderCount", label: "Holders" },
  { value: "curveProgress", label: "Bonding Curve" },
  { value: "createdAt", label: "Created" },
] as const;

export function Controls({
  view,
  sortBy,
  sortOrder,
  onViewChange,
  onSortByChange,
  onSortOrderChange,
}: ControlsProps) {
  return (
    <div className="sticky top-0 z-10">
      <div className="py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            <ViewToggle view={view} onViewChange={onViewChange} />
            {/* TODO: Commented because functionality is not implemented yet */}
            {/* <FilterButtons sortBy={filterBy} onSortChange={onSortChange} /> */}

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value)}
                className="px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg text-white focus:outline-none focus:border-[#2FD345]/50"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() =>
                  onSortOrderChange(sortOrder === "desc" ? "asc" : "desc")
                }
                className="flex items-center gap-2 px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg text-white hover:border-[#2FD345]/50 transition-all duration-200"
              >
                {sortOrder === "desc" ? (
                  <>
                    Descending
                    <ChevronDown className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Ascending
                    <ChevronUp className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
