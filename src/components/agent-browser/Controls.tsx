import { ViewToggle } from './ViewToggle';
import { FilterButtons } from './FilterButtons';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ControlsProps {
  view: "grid" | "table";
  sortBy: "newest" | "oldest";
  filterBy: "all" | "marketcap";
  onViewChange: (view: "grid" | "table") => void;
  onSortChange: (sort: "all" | "marketcap") => void;
  onSortByChange: () => void;
}

export function Controls({ 
  view, 
  sortBy,
  filterBy, 
  onViewChange, 
  onSortChange, 
  onSortByChange 
}: ControlsProps) {
  return (
    <div className="sticky top-0 z-10">
      <div className="py-4">
        <div className="flex flex-wrap items-center">
          <div className="flex items-center gap-4">
            <ViewToggle view={view} onViewChange={onViewChange} />
            <FilterButtons sortBy={filterBy} onSortChange={onSortChange} />
            <button
              onClick={onSortByChange}
              className="flex items-center gap-2 px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg text-white hover:border-[#2FD345]/50 transition-all duration-200"
            >
              <span className="text-sm whitespace-nowrap">
                Creation Time
              </span>
              {sortBy === 'newest' ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 