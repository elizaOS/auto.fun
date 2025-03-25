import { HomepageSortBy } from "@/utils/homepage";
import { ViewToggle } from "./ViewToggle";
import { ChevronUp, ChevronDown } from "lucide-react";
import { PropsWithChildren } from "react";

const SortButton = ({
  selected,
  children,
  onClick,
}: PropsWithChildren<{ selected: boolean; onClick: () => void }>) => {
  return (
    <button
      className={`px-4 py-2.5 rounded-md border border-neutral-800 font-medium font-satoshi flex gap-2 items-center ${selected ? "bg-[#2e2e2e]" : "hover:bg-neutral-900"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface ControlsProps {
  view: "grid" | "table";
  sortBy: HomepageSortBy;
  onViewChange: (view: "grid" | "table") => void;
  onSortByChange: (sortBy: HomepageSortBy) => void;
}

export function Controls({
  view,
  sortBy,
  onViewChange,
  onSortByChange,
}: ControlsProps) {
  return (
    <div className="sticky top-0 z-10">
      <div className="py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 flex-col md:flex-row">
            <ViewToggle view={view} onViewChange={onViewChange} />

            <div className="flex items-center gap-3">
              <SortButton
                onClick={() => onSortByChange("all")}
                selected={sortBy === "all"}
              >
                All
              </SortButton>
              <SortButton
                onClick={() => onSortByChange("marketCap")}
                selected={sortBy === "marketCap"}
              >
                Market Cap
              </SortButton>

              <SortButton
                onClick={() =>
                  onSortByChange(sortBy === "newest" ? "oldest" : "newest")
                }
                selected={sortBy === "newest" || sortBy === "oldest"}
              >
                Creation Time
                {sortBy === "newest" ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </SortButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
