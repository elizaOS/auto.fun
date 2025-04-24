import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  DeepPartial,
  ChartOptions as LightweightChartOptions,
} from "lightweight-charts";
import { getSocket, Socket } from "@/utils/socket";
import { getChartTable } from "@/utils/api";
import { Codex } from "@codex-data/sdk";
import {
  SymbolType,
  TokenPairStatisticsType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { QuoteToken } from "@codex-data/sdk/dist/resources/graphql";

const codex = new Codex(import.meta.env.VITE_CODEX_API_KEY);

interface ChartProps {
  mint: string;
  isImported: boolean;
}

export default function Chart({ mint, isImported }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{
    from: number;
    to: number;
  } | null>(null);

  const useCodex = isImported;
  const networkId = "1399811149";
  const pairId = `${mint}:${networkId}`;
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["chart", mint, useCodex],
    queryFn: async () => {
      const to = Math.floor(new Date().getTime() / 1000.0);
      const from = to - 21600; // 6 hours

      if (useCodex) {
        const { getBars } = await codex.queries.getBars({
          currencyCode: "USD",
          from,
          to,
          symbol: pairId,
          resolution: "1",
          symbolType: SymbolType.Token,
        });

        if (!getBars) return [];

        const candleCount = getBars.o.length;

        const bars = [];
        for (let i = 0; i < candleCount; i++) {
          bars.push({
            open: getBars.o[i],
            high: getBars.h[i],
            low: getBars.l[i],
            close: getBars.c[i],
            volume: parseFloat(getBars?.volume?.[i] || "0"),
            time: getBars.t[i],
          });
        }

        return bars;
      } else {
        const data = await getChartTable({
          pairIndex: 1,
          from,
          to,
          range: 1,
          token: mint,
        });

        return data?.table;
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 30_000, // Since chart is always 1 minute, we can refresh every 30 seconds
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const chartOptions: DeepPartial<LightweightChartOptions> = {
      layout: {
        textColor: "#8c8c8c",
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: {
        vertLines: { color: "#262626", visible: true },
        horzLines: { color: "#262626", visible: true },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: "#262626",
      },
      timeScale: {
        borderColor: "#262626",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        horzLine: {
          color: "#262626",
        },
        vertLine: {
          color: "#262626",
        },
      },
    };

    const chartElement = chartContainerRef.current;

    if (!chartElement) return;

    const chart = createChart(chartElement, chartOptions);
    chartRef.current = chart;

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) {
        setVisibleTimeRange({
          from: range.from as number,
          to: range.to as number,
        });
      }
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      wickUpColor: "#03FF24",
      upColor: "#03FF24",
      wickDownColor: "rgb(225, 50, 85)",
      downColor: "rgb(225, 50, 85)",
      baseLineColor: "#212121",
      borderVisible: false,
    });

    candlestickSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef?.current?.clientWidth });
    };

    window.addEventListener("resize", handleResize);

    let socket: Socket | undefined;
    let cleanup: any;
    /** Handle Websockets for improts and bonded tokens */
    if (useCodex) {
      console.log(`useCodex => ${useCodex} SUBSCRIBE TO CHART WEBSOCKET`);
      const sink = {
        next: (data) => {
          console.log("Got subscription data", data);
          console.log("Got subscription data", data);
          // Check if data contains bars information
          if (data?.data?.onBarsUpdated) {
            const barData = data.data.onBarsUpdated;
            // Process the bar data and update the chart
            if (candlestickSeriesRef.current && barData) {
              // Format the data as needed by your chart library
              const newCandle = {
                time: barData.time,
                open: barData.open,
                high: barData.high,
                low: barData.low,
                close: barData.close,
                volume: barData.volume,
              };
              candlestickSeriesRef.current.update(newCandle);
            }
          }
        },
        error: (err) => {
          console.log("Got subscription error", err);
        },
        complete: () => {
          console.log("Got subscription complete");
        },
      };

      cleanup = codex.subscriptions.onBarsUpdated(
        {
          // address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH WORKS
          pairId: `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2:1`,
          quoteToken: QuoteToken.Token1,
          // pairId,
          // tokenId:
          // networkId: 1,
        },
        sink
      );

      // codex.subscriptions.onBarsUpdated(
      //   {
      //     pairId,
      //     quoteToken: QuoteToken.Token1,
      //   },
      //   sink
      // );
    } else {
      /** Handle incoming data for non-bonded tokens */
      socket = getSocket();
      socket.on("newCandle", (data: any) => {
        if (data.token === mint && candlestickSeriesRef.current) {
          const newCandle = {
            time: data.time * 1000,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
          };

          candlestickSeriesRef.current.update(newCandle);
        }
      });
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (useCodex) {
        cleanup();
      } else if (socket) {
        socket.off("newCandle");
      }
      chart.remove();
    };
  }, [mint, useCodex]);

  // Update chart data when it's available from useQuery
  useEffect(() => {
    if (chartData && chartData.length > 0 && candlestickSeriesRef.current) {
      // Set the initial data
      candlestickSeriesRef.current.setData(chartData || []);
    }
  }, [chartData]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full min-h-[400px]"
      style={{ width: "100%", height: "100%" }}
    >
      {isLoading && (
        <div className="text-center py-4 h-full">Loading chart data...</div>
      )}
    </div>
  );
}
