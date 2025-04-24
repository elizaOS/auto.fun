import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  DeepPartial,
  ChartOptions as LightweightChartOptions,
} from "lightweight-charts";
import { getSocket } from "@/utils/socket";
import { getChartTable } from "@/utils/api";

interface ChartProps {
  mint: string;
}

export default function Chart({ mint }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{
    from: number;
    to: number;
  } | null>(null);

  console.log(visibleTimeRange);

  // Fetch initial chart data using useQuery
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["chart", mint],
    queryFn: async () => {
      const to = Math.floor(new Date().getTime() / 1000.0);
      const from = to - 21600; // 6 hours

      return await getChartTable({
        pairIndex: 1,
        from,
        to,
        range: 1,
        token: mint,
      });
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  console.log({ chartData });
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
    const socket = getSocket();
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

    socket.on("newCandle", (data: any) => {
      console.log({ newCandle: data });

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

    return () => {
      window.removeEventListener("resize", handleResize);
      socket.off("newCandle");
      chart.remove();
    };
  }, [mint]);

  // Update chart data when it's available from useQuery
  useEffect(() => {
    if (
      chartData &&
      chartData.table &&
      chartData.table.length > 0 &&
      candlestickSeriesRef.current
    ) {
      // Set the initial data
      candlestickSeriesRef.current.setData(chartData?.table || []);
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
