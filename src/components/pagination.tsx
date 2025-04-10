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

  const renderPages = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (page <= 3) {
        pages.push(1, 2, 3, 4, "...", totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(
          1,
          "...",
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        );
      } else {
        pages.push(1, page - 1, page, page + 1, "...", totalPages);
      }
    }

    return pages;
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
                key={index}
                className={twMerge([
                  isActive
                    ? "outline-autofun-background-action-highlight bg-autofun-background-card text-autofun-text-primary"
                    : "outline-transparent bg-transparent text-autofun-text-secondary",
                  "cursor-pointer h-8 px-3 py-2 outline outline-offset-[-1px] inline-flex flex-col items-center justify-center gap-2.5 overflow-hidden",
                ])}
                onClick={() => onPageChange?.(item)}
              >
                <div className="select-none text-center text-base font-normal font-dm-mono uppercase leading-normal tracking-widest">
                  {item}
                </div>
              </div>
            );
          } else {
            return (
              <div
                key={`ellipsis-${index}`}
                className="cursor-pointer h-8 px-3 py-2 select-none text-center flex items-center justify-center text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest hover:text-autofun-text-primary transition-colors"
                // makes dots clickable, in or decreasing by 3
                onClick={() => {
                  if (index < pages.indexOf(page)) {
                    onPageChange?.(page - 3);
                  } else {
                    onPageChange?.(page + 3);
                  }
                }}
              >
                {item}
              </div>
            );
          }
        })}
        <li>
          <ChevronRight
            className={twMerge([
              "text-autofun-text-primary size-6 cursor-pointer",
              hasMore ? "opacity-100" : "opacity-50",
            ])}
            onClick={() => {
              if (hasMore) {
                onPageChange?.(page + 1);
              }
            }}
          />
        </li>
      </ul>
    </nav>
  );
};

export default Pagination;
