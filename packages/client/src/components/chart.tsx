import { useEffect, useRef } from "react";
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
import { IToken } from "@/types";
import Loader from "./loader";
import { twMerge } from "tailwind-merge";

interface ChartProps {
  token: IToken;
}

export default function Chart({ token }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);

  const mint = token.mint;

  const useCoingecko =
    token?.imported === 1 ||
    token.status === "migrated" ||
    token.status === "locked";

  const query = useQuery({
    queryKey: ["token", mint, "chart"],
    queryFn: async () => {
      const to = Math.floor(new Date().getTime() / 1000.0);
      const from = to - 21600 * 2;

      const data = await getChartTable({
        pairIndex: 10,
        from,
        to,
        range: 1,
        token: mint,
      });

      if (!data?.table?.length) {
        const lastKnownPrice = Number(token?.tokenPriceUSD) || 0;
        if (isNaN(lastKnownPrice)) return [];

        return [
          {
            time: Math.floor(Date.now() / 1000) * 1000,
            open: lastKnownPrice,
            high: lastKnownPrice,
            low: lastKnownPrice,
            close: lastKnownPrice,
            volume: 0,
          },
        ];
      }

      return data.table.filter(
        (candle) =>
          !isNaN(Number(candle.open)) &&
          !isNaN(Number(candle.high)) &&
          !isNaN(Number(candle.low)) &&
          !isNaN(Number(candle.close)) &&
          !isNaN(Number(candle.time)),
      );
    },
    staleTime: 60 * 1000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
    enabled: !useCoingecko,
  });

  const chartData = query?.data;

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
          labelBackgroundColor: "#262626",
        },
        vertLine: {
          color: "#262626",
          labelBackgroundColor: "#262626",
        },
      },
      localization: {
        // priceFormatter: (price: number) => formatNumber(price, true, false),
        priceFormatter: (price: number) => {
          // Force the price into standard decimal notation (no scientific notation), keeping up to 12 digits after the decimal
          // Example: 3.5898363524445996e-8 → "0.000000035898"
          const normal = Number(price).toFixed(12);
          const decimalsLength =
            normal.split(".")[1]?.replace(/0+$/, "")?.length || 1;

          return new Intl.NumberFormat("en-US", {
            notation: "standard",
            style: "currency",
            currency: "USD",
            maximumFractionDigits:
              Number(decimalsLength || "1") > 8
                ? 8
                : Number(decimalsLength || "1"),
          }).format(price);
        },
      },
    };

    const chartElement = chartContainerRef.current;

    if (!chartElement) return;

    const chart = createChart(chartElement, chartOptions);
    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      wickUpColor: "#03FF24",
      upColor: "#03FF24",
      wickDownColor: "rgb(225, 50, 85)",
      downColor: "rgb(225, 50, 85)",
      baseLineColor: "#212121",
      borderVisible: false,
      priceFormat: {
        minMove: 0.00000001,
      },
    });

    candlestickSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef?.current?.clientWidth });
    };

    window.addEventListener("resize", handleResize);

    let socket: Socket | undefined;

    /** Handle Websockets for improts and bonded tokens */
    if (!useCoingecko) {
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
      if (!useCoingecko && socket) {
        socket.off("newCandle");
      }
      chart.remove();
    };
  }, [mint, useCoingecko]);

  useEffect(() => {
    if (chartData && chartData.length > 0 && candlestickSeriesRef.current) {
      // Set the initial data
      candlestickSeriesRef.current.setData(chartData || []);
    }
  }, [chartData]);

  if (useCoingecko) {
    return (
      <div className="w-full min-h-[500px] relative">
        <iframe
          height="100%"
          width="100%"
          className="min-h-[500px] mt-2"
          id="geckoterminal-embed"
          title="GeckoTerminal Embed"
          src={`https://www.geckoterminal.com/solana/pools/${token.mint}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
          allow="clipboard-write"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      ref={chartContainerRef}
      className="w-full min-h-[500px] relative"
      style={{ width: "100%", height: "100%" }}
    >
      <div
        className={twMerge([
          "size-full absolute left-0 top-0 transition-opacity duration-300",
          !query?.isPending ? "opacity-0 z-0" : "opacity-100 z-10",
        ])}
      >
        <Loader className="h-full bg-autofun-background-primary" />
      </div>
    </div>
  );
}
