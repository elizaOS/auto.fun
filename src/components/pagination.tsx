import { ChevronRight } from "lucide-react";
import React from "react";
import { twMerge } from "tailwind-merge";

export interface IPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

interface PaginationProps {
  pagination: IPagination;
  onPageChange?: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  pagination,
  onPageChange,
}) => {
  const { page, hasMore, totalPages } = pagination;

  if (totalPages <= 1) return null;

  const renderPages = (): (number | string)[] => {
    if (totalPages <= 6) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    let endPages: (string | number)[] = [];
    if (totalPages >= 3) {
      endPages = ["...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, 2, 3, ...endPages];
  };

  const pages = renderPages();

  return (
    <nav aria-label="pagination" className="ml-auto">
      <ul className="flex items-center gap-1">
        {pages.map((item, index) => {
          if (typeof item === "number") {
            const isActive = item === page;
            return (
              <div
                className={twMerge([
                  isActive
                    ? "outline-autofun-background-action-highlight bg-autofun-background-card text-autofun-text-primary "
                    : "outline-transparent bg-transparent text-autofun-text-secondary ",
                  "cursor-pointer h-8 px-3 py-2 outline outline-offset-[-1px] inline-flex flex-col items-center justify-center gap-2.5 overflow-hidden",
                ])}
                onClick={() => {
                  if (onPageChange) {
                    onPageChange(item);
                  }
                }}
              >
                <div className="select-none text-center text-base font-normal font-dm-mono uppercase leading-normal tracking-widest">
                  {item}
                </div>
              </div>
            );
          } else {
            return (
              <li
                key={`ellipsis-${index}`}
                className="h-8 px-3 py-2 select-none text-center justify-center text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest"
              >
                {item}
              </li>
            );
          }
        })}
        <li>
          <ChevronRight
            className={twMerge([
              "text-autofun-text-primary size-6",
              hasMore ? "opacity-100" : "opacity-50",
            ])}
            onClick={() => {
              if (hasMore && onPageChange) {
                onPageChange(page + 1);
              }
            }}
          />
        </li>
      </ul>
    </nav>
  );
};

export default Pagination;
