"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTokens } from "@/utils/tokens";
import { Controls } from "./Controls";
import { GridView } from "./GridView";
import { Paginator } from "../common/Paginator";
import { TableView } from "./TableView";

export function AgentBrowser() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<string>("featured");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const router = useRouter();

  const {
    items: tokens,
    currentPage,
    hasNextPage,
    nextPage,
    previousPage,
    isLoading,
    totalPages,
    goToPage,
  } = useTokens(sortBy, sortOrder);

  const handleViewChange = (newView: "grid" | "table") => setView(newView);

  const handleSortByChange = (newSortBy: string) => {
    setSortBy(newSortBy);
  };

  const handleSortOrderChange = (newOrder: "asc" | "desc") => {
    setSortOrder(newOrder);
  };

  const handleTokenClick = (mint: string) => router.push(`/coin/${mint}`);

  const renderGridSkeletons = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 w-full px-2 sm:px-4">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-[12px] w-full max-w-[411.5px] h-auto min-h-[288px] p-4 bg-[#171717] border border-[#262626] rounded-[8px]"
        >
          {/* Top container with image and details */}
          <div className="flex flex-col sm:flex-row gap-[12px] w-full">
            {/* Image skeleton */}
            <div className="w-full sm:w-[120px] h-[127.5px] rounded-[4px] bg-[#262626] animate-pulse shrink-0" />

            {/* Right side content */}
            <div className="flex flex-col gap-[12px] flex-1 min-w-0">
              {/* Name and time */}
              <div className="flex justify-between items-start w-full h-[24px] flex-wrap gap-2">
                <div className="flex items-center gap-[8px] h-[24px] min-w-[160px] flex-1">
                  <div className="h-5 bg-[#262626] rounded w-2/3 animate-pulse" />
                  <div className="h-5 bg-[#262626] rounded w-1/3 animate-pulse" />
                </div>
                <div className="flex items-center gap-[4px] px-[8px] h-[24px] w-[60px] bg-[#262626] rounded-[6px] animate-pulse shrink-0" />
              </div>

              {/* Market cap skeleton */}
              <div className="flex flex-col gap-[4px] w-full">
                <div className="h-4 bg-[#262626] rounded w-1/4 animate-pulse" />
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="h-6 bg-[#262626] rounded w-1/3 animate-pulse" />
                  <div className="flex items-center gap-[6px] shrink-0">
                    <div className="h-4 bg-[#262626] rounded w-[80px] animate-pulse" />
                    <div className="w-4 h-4 bg-[#262626] rounded animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Bonding curve skeleton */}
              <div className="flex flex-col gap-[4px] w-full">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="h-4 bg-[#262626] rounded w-2/3 animate-pulse" />
                  <div className="h-4 bg-[#262626] rounded w-[40px] animate-pulse shrink-0" />
                </div>
                <div className="relative w-full h-[8px] bg-[#262626] rounded-full">
                  <div className="absolute h-[8px] w-[28%] bg-gradient-to-r from-[#1a1a1a] to-[#333333] rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Description skeleton */}
          <div className="flex flex-col gap-[12px] w-full">
            <div className="h-[40px] bg-[#262626] rounded animate-pulse" />
            <div className="w-full h-[1px] bg-[#262626]" />
          </div>

          {/* Button skeleton */}
          <div className="w-full h-[44px] bg-[#2E2E2E] rounded-[6px] animate-pulse mt-auto" />
        </div>
      ))}
    </div>
  );

  const renderListSkeletons = () => (
    <div className="w-full px-2 sm:px-4">
      <div className="w-full bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr,1fr,1fr,1fr] md:grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-4 p-4 border-b border-[#262626]">
          {["Name", "Price", "Market Cap", "Volume", "24h"].map((_, i) => (
            <div key={i} className="h-6 bg-[#262626] rounded animate-pulse" />
          ))}
        </div>

        {/* Table Body */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr,1fr,1fr,1fr] md:grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-4 p-4 border-b border-[#262626] last:border-b-0"
          >
            {/* Name Column */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#262626] rounded animate-pulse" />
              <div className="flex-1">
                <div className="h-5 bg-[#262626] rounded w-24 animate-pulse mb-1" />
                <div className="h-4 bg-[#262626] rounded w-16 animate-pulse" />
              </div>
            </div>

            {/* Price Column */}
            <div className="h-6 bg-[#262626] rounded w-20 animate-pulse" />

            {/* Market Cap Column */}
            <div className="h-6 bg-[#262626] rounded w-24 animate-pulse" />

            {/* Volume Column */}
            <div className="hidden md:block">
              <div className="h-6 bg-[#262626] rounded w-20 animate-pulse" />
            </div>

            {/* 24h Column */}
            <div className="h-6 bg-[#262626] rounded w-16 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <div className="w-full max-w-[1680px] mx-auto mt-8 sm:mt-14 px-2 sm:px-4">
        <div className="border-b border-[#262626]/40">
          <Controls
            view={view}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onViewChange={handleViewChange}
            onSortByChange={handleSortByChange}
            onSortOrderChange={handleSortOrderChange}
          />
        </div>

        <div className="pt-4 pb-6">
          {isLoading ? (
            view === "grid" ? (
              renderGridSkeletons()
            ) : (
              renderListSkeletons()
            )
          ) : view === "grid" ? (
            <GridView tokens={tokens} onTokenClick={handleTokenClick} />
          ) : (
            <TableView tokens={tokens} onTokenClick={handleTokenClick} />
          )}
        </div>

        <div className="flex justify-center py-4 sm:py-6">
          <Paginator
            currentPage={currentPage}
            hasNextPage={hasNextPage}
            previousPage={previousPage}
            nextPage={nextPage}
            goToPage={goToPage}
            totalPages={totalPages}
          />
        </div>
      </div>
    </div>
  );
}
