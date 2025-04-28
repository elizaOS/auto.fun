import { useOutsideClickDetection } from "@/hooks/use-outside-clickdetection";
import { IToken } from "@/types";
import { abbreviateNumber, shortenAddress } from "@/utils";
import { getSearchTokens } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import CopyButton from "./copy-button";
import Verified from "./verified";

export default function SearchBar() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClickDetection([ref], () => {
    setShowSearchResults(false);
  });

  const query = useQuery({
    queryKey: ["search-tokens", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { tokens: [] };
      const data = await getSearchTokens({ search: searchQuery });
      return data as { tokens: IToken[] };
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const debouncedSetSearchQuery = useCallback(
    debounce((value: string) => {
      setSearchQuery(value);
    }, 300),
    [],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    setShowSearchResults(true);
    debouncedSetSearchQuery(value);
  };

  useEffect(() => {
    return () => {
      debouncedSetSearchQuery.cancel();
    };
  }, [debouncedSetSearchQuery]);

  return (
    <div className="relative min-w-[120px] max-w-full lg:w-[400px] xl:w-[600px]">
      <div className="flex w-full items-center h-11 px-3 bg-[#171717] border border-[#262626] hover:border-[#03FF24]/50 focus-within:border-[#03FF24]/50 transition-colors">
        <Search className="size-6 text-[#8C8C8C] group-hover:text-[#03FF24] shrink-0 mr-2" />
        <input
          type="text"
          value={searchInput}
          onChange={handleInputChange}
          placeholder="Search"
          className="flex-1 select-none bg-transparent text-base font-medium text-[#8C8C8C] placeholder-[#8C8C8C] focus:outline-none hover:placeholder-white focus:placeholder-white transition-colors md:w-auto w-[50px]"
        />
      </div>

      {showSearchResults && (
        <div
          className="absolute min-w-[290px] w-full p-2 bg-[#171717] border border-[#262626] flex flex-col gap-3 mt-2 max-h-[60vh] overflow-auto shadow-lg"
          ref={ref}
        >
          {query.isFetching ? (
            <div className="text-autofun-background-action-highlight">
              Searching for tokens...
            </div>
          ) : query.data?.tokens.length === 0 ? (
            <div className="text-autofun-background-action-highlight">
              No tokens found.
            </div>
          ) : (
            query.data?.tokens.map((token: IToken) => (
              <AgentSearchResult
                key={token.mint}
                token={token}
                onNavigate={() => setShowSearchResults(false)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

const AgentSearchResult = ({
  token,
  onNavigate,
}: {
  token: IToken;
  onNavigate: () => void;
}) => {
  const handleCopyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link to={`/token/${token?.mint}`} onClick={onNavigate}>
      <div className="flex items-center gap-2 p-2 hover:bg-[#262626] transition-all duration-200 group cursor-pointer">
        <img
          className="w-10 h-10 shrink-0 object-cover"
          src={token?.image || "/placeholder.png"}
          alt={token?.name || "search_result"}
        />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="text-white text-[16px] font-medium group-hover:text-[#03FF24] transition-colors flex items-center gap-1">
            <span className="truncate">{token?.name}</span>
            <span className="text-[#8C8C8C] text-[16px] uppercase tracking-widest group-hover:text-white/80 transition-colors flex-shrink-0">
              ${token?.ticker}
            </span>
            <Verified isVerified={token?.verified ? true : false} />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">
              {shortenAddress(token?.mint)}
            </div>
            <div onClick={handleCopyClick}>
              <CopyButton text={token?.mint} />
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 ml-auto flex flex-col items-end">
          <span className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">
            MC
          </span>
          <span className="text-[#03FF24] text-sm font-medium whitespace-nowrap">
            {abbreviateNumber(token?.marketCapUSD)}
          </span>
        </div>
      </div>
    </Link>
  );
};
