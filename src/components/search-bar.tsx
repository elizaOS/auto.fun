import { Search } from "lucide-react";
import { Link } from "react-router";
import CopyButton from "./copy-button";
import { formatNumber, abbreviateNumber } from "@/utils";
import { useEffect, useRef, useState } from "react";
import { debounce } from "lodash";
import { IToken } from "@/types";
import { useOutsideClickDetection } from "@/hooks/use-outside-clickdetection";
import { getSearchTokens } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

export default function SearchBar() {
  const [searchResults, setSearchResults] = useState<IToken[] | []>([]);
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetection([ref], () => {
    setShowSearchResults(false);
    setSearchResults([]);
  });

  const query = useQuery({
    queryKey: ["search-tokens", search],
    queryFn: async () => {
      const data = await getSearchTokens({ search });
      return data as { tokens: IToken[] };
    },
  });

  const tokens = query.data?.tokens ?? [];
  useEffect(() => {
    setSearchResults(tokens);
  }, [tokens]);

  const handleSearch = useRef(
    debounce((query: string) => {
      setSearch(query);
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
    };
  }, [handleSearch]);

  return (
    <div className="relative w-full max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      <div className="flex w-full items-center h-11 px-3 gap-2 bg-[#171717] border border-[#262626] hover:border-[#2FD345]/50 focus-within:border-[#2FD345]/50 transition-colors">
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
          {query.isFetching ? (
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
      <div className="flex items-center gap-2 p-2 hover:bg-[#262626] transition-all duration-200 group cursor-pointer">
        <img className="w-10 h-10 shrink-0 object-cover" src={imageUrl} alt={name} />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="text-white text-[16px] font-medium group-hover:text-[#2FD345] transition-colors flex items-center">
            <span className="truncate">{name}</span>
            <span className="pl-2 text-[#8C8C8C] text-[16px] uppercase tracking-widest group-hover:text-white/80 transition-colors flex-shrink-0">
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
        <div className="flex-shrink-0 ml-auto flex flex-col items-end">
          <span className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">MC</span>
          <span className="text-[#2FD345] text-sm font-medium whitespace-nowrap">
            {abbreviateNumber(marketCap)}
          </span>
        </div>
      </div>
    </Link>
  );
};
