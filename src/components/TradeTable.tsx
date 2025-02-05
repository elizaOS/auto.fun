import { useEffect, useState, useRef, useCallback, memo } from "react";
import Link from "next/link";
import { z } from "zod";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { formatNumber } from "@/utils/number";
import { womboApi } from "@/utils/fetch";
import { useWallet } from "@solana/wallet-adapter-react";

const SwapSchema = z.object({
  _id: z.string(),
  txId: z.string(),
  amountIn: z.number(),
  amountOut: z.number(),
  direction: z.number(),
  price: z.number(),
  timestamp: z.string(),
  tokenMint: z.string(),
  type: z.string(),
  user: z.string(),
});

const SwapsResponseSchema = z.object({
  swaps: z.array(SwapSchema),
  page: z.number().optional(),
  totalPages: z.number().optional(),
  total: z.number().optional(),
  hasMore: z.boolean().optional(),
});

type TradeTableProps = {
  tokenId: string;
};

// Move debounce hook outside component
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Memoize TradeRow component separately
const TradeRow = memo(({ trade }: { trade: z.infer<typeof SwapSchema> }) => {
  const isPositive = trade.direction === 0;
  const solAmount = (trade.direction === 0 ? trade.amountIn : trade.amountOut) / 1e9;
  const tokenAmount = (trade.direction === 0 ? trade.amountOut : trade.amountIn) / 1e6;
  const timeAgo = useTimeAgo(trade.timestamp);

  return (
    <tr className="border-b border-gray-800">
      <td className="py-5 px-4 text-sm">
        {trade.user.slice(0, 4)}...{trade.user.slice(-4)}
      </td>
      <td className="py-5 px-4 text-sm">
        <span className={isPositive ? "text-[#22C55E]" : "text-[#f44336]"}>
          {isPositive ? "Buy" : "Sell"}
        </span>
      </td>
      <td className="py-5 px-4 text-sm">{solAmount.toFixed(3)}</td>
      <td className="py-5 px-4 text-sm">{formatNumber(tokenAmount)}</td>
      <td className="py-5 px-4 text-sm text-gray-400">{timeAgo}</td>
      <td className="py-5 px-4 text-sm text-gray-400">
        <Link 
          href={`https://solscan.io/tx/${trade.txId}`}
          target="_blank"
          className="hover:text-[#22C55E]"
        >
          {trade.txId.slice(0, 4)}...{trade.txId.slice(-4)}
        </Link>
      </td>
    </tr>
  );
});
TradeRow.displayName = 'TradeRow';

export const TradeTable = ({ tokenId }: TradeTableProps) => {
  // Combine related state to reduce re-renders
  const [filters, setFilters] = useState({
    size: 50,
    startDate: "",
    endDate: "",
    showOwnTrades: false
  });
  
  const [tableState, setTableState] = useState({
    trades: [] as z.infer<typeof SwapSchema>[],
    cursor: null as string | null,
    isLoading: false,
    error: null as string | null
  });

  const { publicKey } = useWallet();
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce all filters together
  const debouncedFilters = useDebounce(filters, 500);

  const fetchTrades = useCallback(async (resetCursor = false) => {
    if (!isMounted.current) return;

    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setTableState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const params = new URLSearchParams();
      params.append("limit", debouncedFilters.size.toString());
      
      if (!resetCursor && tableState.cursor) {
        params.append("cursor", tableState.cursor);
      }
      
      if (debouncedFilters.startDate) {
        params.append("startTime", debouncedFilters.startDate);
      }
      
      if (debouncedFilters.endDate) {
        params.append("endTime", debouncedFilters.endDate);
      }

      if (debouncedFilters.showOwnTrades && publicKey) {
        params.append("userAddress", publicKey.toBase58());
      }

      const response = await womboApi.get({
        endpoint: `/swaps/${tokenId}?${params.toString()}`,
        schema: SwapsResponseSchema,
      });
      
      
      if (isMounted.current) {
        setTableState(prev => ({
          ...prev,
          trades: resetCursor ? response.swaps : [...prev.trades, ...response.swaps],
          cursor: response.nextCursor,
          isLoading: false
        }));
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMounted.current) {
        setTableState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to fetch trades'
        }));
      }
    }
  }, [tokenId, debouncedFilters, publicKey]);

  // Cleanup
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch on filter changes
  useEffect(() => {
    fetchTrades(true);
  }, [fetchTrades]);

  // Filter handlers
  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Section */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[#cab7c7]">Size</span>
          <input 
            type="number" 
            value={filters.size}
            onChange={(e) => handleFilterChange('size', Number(e.target.value))}
            className="bg-[#262626] rounded px-2 py-1 w-20 text-white"
            min={1}
          />
        </div>

        {/* Date Range Filters */}
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="bg-[#262626] rounded px-2 py-1 text-white"
          />
          <span className="text-[#cab7c7]">to</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="bg-[#262626] rounded px-2 py-1 text-white"
          />
        </div>

        {/* Own Trades Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[#cab7c7]">Own Trades</span>
          <button
            onClick={() => handleFilterChange('showOwnTrades', !filters.showOwnTrades)}
            className={`w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${
              filters.showOwnTrades ? 'bg-[#22C55E]' : 'bg-[#262626]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${
                filters.showOwnTrades ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Error state */}
      {tableState.error && (
        <div className="text-red-500 text-center py-4">
          {tableState.error}
        </div>
      )}

      {/* Loading state */}
      {tableState.isLoading && tableState.trades.length === 0 ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#22C55E]" />
        </div>
      ) : (
        <div className="overflow-x-auto relative">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-6 px-4 text-[#22C55E] text-sm">ACCOUNT</th>
                <th className="py-6 px-4 text-[#22C55E] text-sm">Type</th>
                <th className="py-6 px-4 text-[#22C55E] text-sm">SOL</th>
                <th className="py-6 px-4 text-[#22C55E] text-sm">WAIFU</th>
                <th className="py-6 px-4 text-[#22C55E] text-sm">DATE</th>
                <th className="py-6 px-4 text-[#22C55E] text-sm">TRANSACTION</th>
              </tr>
            </thead>
            <tbody>
              {tableState.trades.map((trade) => (
                <TradeRow key={trade._id} trade={trade} />
              ))}
            </tbody>
          </table>

          {/* Loading overlay */}
          {tableState.isLoading && (
            <div className="absolute inset-0 bg-black/20 flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#22C55E]" />
            </div>
          )}
        </div>
      )}

      {/* Load More Button */}
      {tableState.cursor && !tableState.isLoading && (
        <button
          onClick={() => fetchTrades()}
          className="px-4 py-2 bg-[#262626] text-white rounded-lg hover:bg-[#333] transition-colors"
        >
          Load More
        </button>
      )}
    </div>
  );
}; 