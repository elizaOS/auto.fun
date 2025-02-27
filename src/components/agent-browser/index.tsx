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
        <div 
          key={i} 
          className="w-[411.5px] h-[288px] bg-[#171717] border border-[#262626] rounded-[8px] animate-pulse"
        />
      ))}
    </div>
  );

  return (
    <div className="w-full">
      <div className="w-full max-w-[1680px] mx-auto">
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