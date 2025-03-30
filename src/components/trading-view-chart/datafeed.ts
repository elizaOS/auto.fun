import type {
  Bar,
  LibrarySymbolInfo,
  IBasicDataFeed,
  DatafeedConfiguration,
  ResolutionString,
} from "@/libraries/charting_library";

import { subscribeOnStream, unsubscribeFromStream } from "./streaming";
import { fetchTokenChartData } from "@/utils/blockchain";

const lastBarsCache = new Map<string, Bar>();
const configurationData: DatafeedConfiguration = {
  supported_resolutions: [
    "1",
    "5",
    "15",
    "45",
    "60",
    "240",
    "1440",
  ] as ResolutionString[],
};

export function getDataFeed({
  pairIndex,
  name,
  token,
}: {
  name: string;
  pairIndex: number;
  token: string;
}): IBasicDataFeed {
  return {
    onReady: (callback) => {
      console.log("[onReady]: Method call");
      setTimeout(() => callback(configurationData));
    },

    searchSymbols: () => {
      console.log("[searchSymbols]: Method call");
    },

    resolveSymbol: async (
      symbolName,
      onSymbolResolvedCallback,
      _onResolveErrorCallback,
      _extension,
    ) => {
      console.log("[resolveSymbol]: Method call", symbolName);

      // Symbol information object
      const symbolInfo: LibrarySymbolInfo = {
        ticker: name,
        name: name,
        description: name,
        type: "crypto",
        session: "24x7",
        timezone: "Etc/UTC",
        minmov: 1,
        pricescale: 1000000000,
        exchange: "",
        has_intraday: true,
        visible_plots_set: "ohlc",
        has_weekly_and_monthly: false,
        supported_resolutions: configurationData.supported_resolutions,
        volume_precision: 2,
        data_status: "streaming",
        format: "price",
        listed_exchange: "",
      };

      console.log("[resolveSymbol]: Symbol resolved", symbolName);
      setTimeout(() => onSymbolResolvedCallback(symbolInfo));
    },

    getBars: async (
      symbolInfo: LibrarySymbolInfo,
      resolution,
      periodParams,
      onHistoryCallback,
      onErrorCallback,
    ) => {
      const { from, to, firstDataRequest } = periodParams;
      const FIVE_DAYS = 5 * 24 * 60 * 60;
      const adjustedFrom = firstDataRequest ? from - FIVE_DAYS : from;

      try {
        console.log(`[getBars]: Fetching chart data from blockchain for ${token}, resolution: ${resolution}`);
        
        const chartData = await fetchTokenChartData(
          token,
          adjustedFrom,
          to,
          +resolution
        );

        if (!chartData || !chartData.table || chartData.table.length === 0) {
          console.log("[getBars]: No data returned from blockchain");
          onHistoryCallback([], { noData: true });
          return;
        }

        let bars: Bar[] = [];
        const nextTime = chartData.nextTime;

        chartData.table.forEach((bar: Bar) => {
          if (bar.time >= adjustedFrom && bar.time < to) {
            bars = [...bars, { ...bar, time: bar.time * 1000 }];
          }
        });

        console.log(`[getBars]: Processed ${bars.length} bars from blockchain data`);

        if (!bars.length) {
          // Don't set noDataFlags here as this might be a temporary gap in data
          onHistoryCallback([], { noData: true });
          return;
        }

        if (firstDataRequest) {
          lastBarsCache.set(symbolInfo.name, {
            ...bars[bars.length - 1],
          });
        }

        onHistoryCallback(bars, {
          noData: false,
          nextTime,
        });
      } catch (error) {
        console.log("[getBars]: Error fetching blockchain chart data", error);
        onErrorCallback(error as string);
      }
    },

    subscribeBars: (
      symbolInfo,
      resolution,
      onRealtimeCallback,
      subscriberUID,
      onResetCacheNeededCallback,
    ) => {
      console.log(
        "[subscribeBars]: Method call with subscriberUID:",
        subscriberUID,
      );

      // Ensure we have the last bar from cache
      let lastBar = lastBarsCache.get(symbolInfo.name);
      if (!lastBar) {
        console.log("[subscribeBars]: No last bar found");
        // Instead of creating a bar with zeros, we'll create a placeholder
        // but we won't actually display it until we get real data
        lastBar = {
          time: Math.floor(Date.now() / 1000) * 1000,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
        };
        lastBarsCache.set(symbolInfo.name, lastBar);
      }

      subscribeOnStream(
        symbolInfo,
        resolution,
        (bar) => {
          // Only update the chart if we have real data (non-zero values)
          if (bar.close > 0) {
            // For the first real bar, set all OHLC values to the close price
            // to avoid the "jump from zero" effect
            if (lastBar.close === 0) {
              const firstRealBar = {
                ...bar,
                open: bar.close,
                high: bar.close,
                low: bar.close,
              };
              onRealtimeCallback(firstRealBar);
              lastBarsCache.set(symbolInfo.name, firstRealBar);
            } else {
              // Normal update for subsequent bars
              onRealtimeCallback(bar);
              lastBarsCache.set(symbolInfo.name, bar);
            }
          }
        },
        subscriberUID,
        onResetCacheNeededCallback,
        lastBar,
        pairIndex,
      );
    },

    unsubscribeBars: (subscriberUID) => {
      console.log(
        "[unsubscribeBars]: Method call with subscriberUID:",
        subscriberUID,
      );
      unsubscribeFromStream(subscriberUID);
    },
  };
}
