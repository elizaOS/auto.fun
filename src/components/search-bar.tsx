import { Search, X } from "lucide-react";
import { Link } from "react-router";
import CopyButton from "./copy-button";
import { formatNumber } from "@/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSearchTokens } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { IToken } from "@/types";


export default function SearchBar({ isMobile }: { isMobile: boolean }) {
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ["search-tokens", search],
    queryFn: async () => {
      const data = await getSearchTokens({ search });
      return setSearchResults(data.tokens);
    },
  });
  
  const handleSearch = useRef(
    debounce((query: string) => {
      setSearch(query);
    }, 300),
  ).current;
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShowSearchResults(true)
    handleSearch(value);
  };
  
  useEffect(() => {
    return () => {
      handleSearch.cancel();
    };
  }, [handleSearch]);
  
  useLayoutEffect(
    function hideBodyScrollBar() {
      const { overflow } = window.getComputedStyle(document.body);
  
      if (showMobileSearch) {
        document.body.style.overflow = "hidden";
      }
  
      return () => {
        document.body.style.overflow = overflow;
      };
    },
    [showMobileSearch]
  );
  console.log("search result -->", searchResults)


  if (isMobile) {
    return (
      <div>
        <Search
          className="cursor-pointer"
          onClick={() => setShowMobileSearch(true)}
        />

        {showMobileSearch && (
          <div className="fixed inset-0 bg-neutral-900 flex flex-col">
            <div className="flex items-center">
              <div className="relative flex-1 py-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={handleInputChange}
                  placeholder="Symbol or Address..."
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-transparent text-[#d1d1d1] text-sm placeholder:text-sm leading-tight focus:outline-none"
                />
              </div>
              <X onClick={() => setShowMobileSearch(false)} />
            </div>
            {showSearchResults && (
              <div
                className="w-full bg-neutral-900 px-4 rounded-b-lg flex flex-col flex-1 gap-6 mt-[14px] overflow-y-scroll no-scrollbar"
                ref={ref}
              >
                <div className="text-[#03ff24] text-xs font-normal uppercase leading-none tracking-widest">
                  <Link to="/">Tokens</Link>
                </div>
                {searchResults.map((token: IToken) => (
                  <AgentSearchResult
                    key={token.mint}
                    id={token.mint}
                    marketCap={token.marketCapUSD}
                    name={token.name}
                    symbol={token.ticker}
                    imageUrl={token.image}
                    onNavigate={() => {
                      setShowSearchResults(false);
                      setShowMobileSearch(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <div className="flex items-center h-11 w-full px-2 gap-2 bg-[#171717] border border-[#262626] rounded-md hover:border-[#2FD345]/50 focus-within:border-[#2FD345]/50 transition-colors">
        <Search className="w-6 h-6 text-[#8C8C8C] group-hover:text-[#2FD345]" />
        <input
          type="text"
          value={search}
          onChange={handleInputChange}
          placeholder="Symbol or Address..."
          className="flex-1 bg-transparent text-base font-medium text-[#8C8C8C] placeholder-[#8C8C8C] focus:outline-none hover:placeholder-white focus:placeholder-white transition-colors"
        />
      </div>

      {showSearchResults && (
        <div
          className="absolute w-full p-3.5 bg-[#171717] rounded-lg border border-[#262626] flex flex-col gap-6 mt-2 max-h-[60vh] overflow-auto z-50 shadow-lg"
          ref={ref}
        >
          <div className="text-[#2FD345] text-xs font-normal uppercase leading-none tracking-widest">
            Tokens
          </div>
          {searchResults.map((token: IToken) => (
            <AgentSearchResult
              key={token.mint}
              id={token.mint}
              marketCap={token.marketCapUSD}
              name={token.name}
              symbol={token.ticker}
              imageUrl={token.image}
              onNavigate={() => setShowSearchResults(false)}
            />
          ))}
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
    <Link to={`/coin/${id}`} onClick={onNavigate}>
      <div className="flex items-center gap-4 p-2 hover:bg-[#262626] rounded-md transition-all duration-200 group cursor-pointer">
        <img
          className="w-10 h-10 rounded-lg object-cover"
          src={imageUrl}
          alt={name}
        />
        <div className="flex flex-col gap-1">
          <div className="text-white text-sm font-medium group-hover:text-[#2FD345] transition-colors">
            {name}
          </div>
          <div className="text-[#8C8C8C] text-xs uppercase tracking-widest group-hover:text-white/80 transition-colors">
            ${symbol}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">
              {id.slice(0, 3)}...{id.slice(-3)}
            </div>
            <CopyButton text={id} />
          </div>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[#2FD345] text-xs">MC:</span>
          <span className="text-[#2FD345] text-xs">
            ${formatNumber(marketCap, false)}
          </span>
        </div>
      </div>
    </Link>
  );
};
