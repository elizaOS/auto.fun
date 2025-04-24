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
import { SymbolType } from "@codex-data/sdk/dist/sdk/generated/graphql";

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

  const { data: chartData, isLoading } = useQuery({
    queryKey: ["chart", mint, useCodex],
    queryFn: async () => {
      const to = Math.floor(new Date().getTime() / 1000.0);
      const from = to - 21600; // 6 hours

      if (useCodex) {
        const codex = new Codex(import.meta.env.VITE_CODEX_API_KEY);

        const { getBars } = await codex.queries.getBars({
          currencyCode: "USD",
          from,
          to,
          symbol: `${mint}:1399811149`,
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
    refetchInterval: 10_000,
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
    /** Handle Websockets for improts and bonded tokens */
    if (useCodex) {
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
      } else if (socket) {
        socket.off("newCandle");
      }
      chart.remove();
    };
  }, [mint]);

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
      className="w-full"
      style={{ width: "100%", height: "100%" }}
    >
      {isLoading && (
        <div className="text-center py-4">Loading chart data...</div>
      )}
    </div>
  );
}
