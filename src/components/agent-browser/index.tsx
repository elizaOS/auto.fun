"use client";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useTokens } from "@/utils/tokens";
import { Controls } from './Controls';
import { GridView } from './GridView';
import { Paginator } from "../common/Paginator";
import { SortValue } from './SortDropdown';
import { TableView } from './TableView';

export function AgentBrowser() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<SortValue>('newest');
  const [filterBy, setFilterBy] = useState<"all" | "marketcap">("all");
  const router = useRouter();

  const {
    items: tokensOriginal,
    currentPage,
    hasPreviousPage,
    hasNextPage,
    nextPage,
    previousPage,
    isLoading,
  } = useTokens();

  // Sort and filter tokens
  const tokens = useMemo(() => {
    if (!tokensOriginal) return [];
    
    let filteredTokens = [...tokensOriginal];

    // Apply filters first
    if (filterBy === "marketcap") {
      filteredTokens = filteredTokens.filter(token => Number(token.marketCapUSD) > 0);
    }

    // Then apply sorting
    switch (sortBy) {
      case 'newest':
        return filteredTokens.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      
      case 'oldest':
        return filteredTokens.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      
      case 'mcap_high':
        return filteredTokens.sort((a, b) => 
          Number(b.marketCapUSD) - Number(a.marketCapUSD)
        );
      
      case 'mcap_low':
        return filteredTokens.sort((a, b) => 
          Number(a.marketCapUSD) - Number(b.marketCapUSD)
        );

      default:
        return filteredTokens;
    }
  }, [tokensOriginal, sortBy, filterBy]);

  const handleViewChange = (newView: "grid" | "table") => setView(newView);
  
  const handleSortChange = (sort: "all" | "marketcap") => {
    setFilterBy(sort);
    // When changing filter, reset sort to newest
    setSortBy('newest');
  };

  const handleSortByChange = (value: string) => {
    setSortBy(value as SortValue);
  };

  const handleTokenClick = (mint: string) => router.push(`/coin/${mint}`);

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 place-items-center">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex flex-col gap-[12px] w-[411.5px] h-[288px] p-[16px_12px] bg-[#171717] border border-[#262626] rounded-[8px]">
          {/* Top container with image and details */}
          <div className="flex gap-[12px] w-full h-[136px]">
            {/* Image skeleton */}
            <div className="w-[120px] h-[127.5px] rounded-[4px] bg-[#262626] animate-pulse" />
            
            {/* Right side content */}
            <div className="flex flex-col gap-[12px] flex-1">
              {/* Name and time */}
              <div className="flex justify-between items-start w-full h-[24px]">
                <div className="flex items-center gap-[8px] h-[24px] w-[160px]">
                  <div className="h-5 bg-[#262626] rounded w-2/3 animate-pulse" />
                  <div className="h-5 bg-[#262626] rounded w-1/3 animate-pulse" />
                </div>
                <div className="flex items-center gap-[4px] px-[8px] h-[24px] w-[60px] bg-[#262626] rounded-[6px] animate-pulse" />
              </div>
              
              {/* Market cap skeleton */}
              <div className="flex flex-col gap-[4px] w-full h-[48px]">
                <div className="h-4 bg-[#262626] rounded w-1/4 animate-pulse" />
                <div className="flex items-center justify-between">
                  <div className="h-6 bg-[#262626] rounded w-1/3 animate-pulse" />
                  <div className="flex items-center gap-[6px]">
                    <div className="h-4 bg-[#262626] rounded w-[80px] animate-pulse" />
                    <div className="w-4 h-4 bg-[#262626] rounded animate-pulse" />
                  </div>
                </div>
              </div>
              
              {/* Bonding curve skeleton */}
              <div className="flex flex-col gap-[4px] w-full h-[40px]">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-[#262626] rounded w-2/3 animate-pulse" />
                  <div className="h-4 bg-[#262626] rounded w-[40px] animate-pulse" />
                </div>
                <div className="relative w-full h-[8px] bg-[#262626] rounded-full">
                  <div className="absolute h-[8px] w-[28%] bg-gradient-to-r from-[#1a1a1a] to-[#333333] rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Description skeleton */}
          <div className="flex flex-col gap-[12px] w-full h-[52px]">
            <div className="h-[40px] bg-[#262626] rounded animate-pulse" />
            <div className="w-full h-[1px] bg-[#262626]" />
          </div>
          
          {/* Button skeleton */}
          <div className="w-full h-[44px] bg-[#2E2E2E] rounded-[6px] animate-pulse" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full">
      <div className="w-full max-w-[1680px] mx-auto mt-14">
        <div className="border-b border-[#262626]/40">
          <Controls
            view={view}
            sortBy={sortBy}
            filterBy={filterBy}
            onViewChange={handleViewChange}
            onSortChange={handleSortChange}
            onSortByChange={handleSortByChange}
          />
        </div>

        <div className="pt-4 pb-6">
          {isLoading ? (
            renderSkeletons()
          ) : view === "grid" ? (
            <GridView tokens={tokens} onTokenClick={handleTokenClick} />
          ) : (
            <TableView tokens={tokens} onTokenClick={handleTokenClick} />
          )}
        </div>

        <div className="flex justify-center py-6">
          <Paginator
            currentPage={currentPage}
            hasPreviousPage={hasPreviousPage}
            hasNextPage={hasNextPage}
            previousPage={previousPage}
            nextPage={nextPage}
          />
        </div>
      </div>
    </div>
  );
} 