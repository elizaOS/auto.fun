import { Search } from "lucide-react";
import { Link } from "react-router";
import CopyButton from "./copy-button";
import { formatNumber } from "@/utils";
import { useEffect, useRef, useState } from "react";
import { debounce } from "lodash";
import { IToken } from "@/types";
import { useOutsideClickDetection } from "@/hooks/use-outside-clickdetection";
import { useGlobalWebSocket, WebSocketEvent } from "@/hooks/use-websocket";
import { useQueryClient } from "@tanstack/react-query";

// Add custom event name for search results
declare module "@/hooks/use-websocket" {
  export interface WebSocketEventMap {
    searchResults: { tokens: IToken[] };
  }
}

export default function SearchBar() {
  const [searchResults, setSearchResults] = useState<IToken[] | []>([]);
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetection([ref], () => {
    setShowSearchResults(false);
    setSearchResults([]);
  });

  // Use WebSocket for token search
  const { connected, addEventListener, sendMessage } = useGlobalWebSocket();

  // Listen for search results via WebSocket
  useEffect(() => {
    if (!connected) return;
    
    // Set up listener for search results
    const unsubscribe = addEventListener<{tokens: IToken[]}>("searchResults" as WebSocketEvent, (data) => {
      if (data && data.tokens) {
        console.log("Received search results via WebSocket:", data.tokens.length, "tokens");
        
        // Cache the search results
        if (search) {
          queryClient.setQueryData(["search-tokens", search], { tokens: data.tokens });
        }
        
        setSearchResults(data.tokens);
        setIsSearching(false);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [addEventListener, connected, queryClient, search]);
  
  // Function to request search via WebSocket
  const requestSearch = (searchQuery: string) => {
    if (!connected || !sendMessage) return;
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If search is empty, clear results
    if (!searchQuery || searchQuery.trim() === "") {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    // Try to get from cache first
    const cachedResults = queryClient.getQueryData<{tokens: IToken[]}>([
      "search-tokens",
      searchQuery
    ]);
    
    if (cachedResults && cachedResults.tokens) {
      console.log("Using cached search results:", cachedResults.tokens.length, "tokens");
      setSearchResults(cachedResults.tokens);
      return;
    }
    
    // If no cache, request via WebSocket
    console.log("Requesting search via WebSocket:", searchQuery);
    setIsSearching(true);
    
    sendMessage({
      event: "searchTokens",
      data: { search: searchQuery }
    });
    
    // Set a timeout to fall back to empty results if no response
    searchTimeoutRef.current = setTimeout(() => {
      if (isSearching) {
        console.log("Search timed out, showing empty results");
        setIsSearching(false);
        setSearchResults([]);
      }
    }, 5000); // 5 second timeout
  };

  const handleSearch = useRef(
    debounce((query: string) => {
      setSearch(query);
      requestSearch(query);
    }, 300),
  ).current;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShowSearchResults(true);
    handleSearch(value);
  };

  useEffect(() => {
    return () => {
      handleSearch.cancel();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [handleSearch]);

  return (
    <div className="relative">
      <div className="flex w-full md:max-w-72 lg:max-w-96 items-center h-11 px-2 gap-2 bg-[#171717] border border-[#262626] hover:border-[#2FD345]/50 focus-within:border-[#2FD345]/50 transition-colors">
        <Search className="w-6 h-6 text-[#8C8C8C] group-hover:text-[#2FD345] shrink-0" />
        <input
          type="text"
          value={search}
          onChange={handleInputChange}
          placeholder="Symbol or Address..."
          className="flex-1 select-none bg-transparent text-base font-medium text-[#8C8C8C] placeholder-[#8C8C8C] focus:outline-none hover:placeholder-white focus:placeholder-white transition-colors"
        />
      </div>

      {showSearchResults && (
        <div
          className="absolute w-full p-3.5 bg-[#171717] border border-[#262626] flex flex-col gap-3 mt-2 max-h-[60vh] overflow-auto shadow-lg"
          ref={ref}
        >
          <div className="text-[16px] font-normal leading-none tracking-widest">
            Tokens
          </div>
          {isSearching ? (
            <div className="text-autofun-background-action-highlight">
              Searching for tokens...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-autofun-background-action-highlight">
              No tokens found.
            </div>
          ) : (
            searchResults.map((token: IToken) => (
              <AgentSearchResult
                key={token.mint}
                id={token.mint}
                marketCap={token.marketCapUSD}
                name={token.name}
                symbol={token.ticker}
                imageUrl={token.image}
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
  name,
  symbol,
  id,
  marketCap,
  imageUrl,
  onNavigate,
}: {
  name: string;
  symbol: string;
  id: string;
  marketCap: number;
  imageUrl: string;
  onNavigate: () => void;
}) => {
  return (
    <Link to={`/token/${id}`} onClick={onNavigate}>
      <div className="flex items-center gap-4 p-2 hover:bg-[#262626] transition-all duration-200 group cursor-pointer">
        <img className="w-10 h-10 object-cover" src={imageUrl} alt={name} />
        <div className="flex flex-col gap-1">
          <div className="text-white text-[16px] font-medium group-hover:text-[#2FD345] transition-colors">
            {name}
            <span className="px-2  text-[#8C8C8C] text-[16px] uppercase tracking-widest group-hover:text-white/80 transition-colors">
              ${symbol}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">
              {id.slice(0, 3)}...{id.slice(-3)}
            </div>
            <CopyButton text={id} />
          </div>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[#8C8C8C] text-sm">MC:</span>
          <span className="text-[#2FD345] text-sm">
            {formatNumber(marketCap, false)}
          </span>
        </div>
      </div>
    </Link>
  );
};
