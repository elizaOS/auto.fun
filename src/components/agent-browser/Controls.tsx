import { ViewToggle } from './ViewToggle';
import { FilterButtons } from './FilterButtons';
import { SortDropdown, sortOptions, SortValue } from './SortDropdown';

interface ControlsProps {
  view: "grid" | "table";
  sortBy: SortValue;
  filterBy: "all" | "marketcap";
  onViewChange: (view: "grid" | "table") => void;
  onSortChange: (sort: "all" | "marketcap") => void;
  onSortByChange: (value: SortValue) => void;
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
            <SortDropdown 
              value={sortBy} 
              onChange={onSortByChange} 
              options={sortOptions} 
            />
          </div>
        </div>
      </div>
    </div>
  );
} 