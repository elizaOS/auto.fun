"use client";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ChartingLibraryWidgetOptions,
  IChartingLibraryWidget,
  ResolutionString,
  SeriesType,
  widget,
} from "@/libraries/charting_library";
import {
  chartOverrides,
  disabledFeatures,
  enabledFeatures,
} from "@/utils/constants";
import { getDataFeed } from "./datafeed";
import ReactLoading from "react-loading";
import { twMerge } from "tailwind-merge";
import UserContext from "@/context/UserContext";
import { CandlestickChart, LineChart, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TVChartContainerProps = {
  name: string;
  pairIndex: number;
  token: string;
  classNames?: {
    container: string;
  };
};

const TIME_FRAMES = [
  { label: "1m", resolution: "1" as ResolutionString },
  { label: "15m", resolution: "15" as ResolutionString },
  { label: "1h", resolution: "60" as ResolutionString },
  { label: "8h", resolution: "480" as ResolutionString },
  { label: "1M", resolution: "1M" as ResolutionString },
];

export const TVChartContainer = ({
  name,
  pairIndex,
  token,
}: TVChartContainerProps) => {
  const chartContainerRef =
    useRef<HTMLDivElement>() as React.MutableRefObject<HTMLInputElement>;
  const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);
  const { isLoading, setIsLoading } = useContext(UserContext);
  const [chartType, setChartType] = useState("Candlestick");

  useEffect(() => {
    if (!chartContainerRef.current) {
      return () => {};
    }
    if (tvWidgetRef.current) {
      tvWidgetRef.current.remove();
    }
    const elem = chartContainerRef.current;

    if (name) {
      const widgetOptions: ChartingLibraryWidgetOptions = {
        symbol: name,
        debug: false,
        datafeed: getDataFeed({ pairIndex, name, token }),
        theme: "dark",
        locale: "en",
        container: elem,
        library_path: `${location.protocol}//${location.host}/libraries/charting_library/`,
        loading_screen: {
          backgroundColor: "#171717",
          foregroundColor: "#171717",
        },
        enabled_features: [
          ...enabledFeatures,
          "header_widget",
          "timeframes_toolbar",
          "header_chart_type",
        ],
        disabled_features: [
          ...disabledFeatures,
          "header_symbol_search",
          "header_settings",
          "header_compare",
          "header_undo_redo",
          "header_screenshot",
          "use_localstorage_for_settings",
          "volume_force_overlay",
        ],
        client_id: "tradingview.com",
        user_id: "public_user_id",
        fullscreen: false,
        autosize: true,
        custom_css_url: "/tradingview-chart.css",
        toolbar_bg: "#171717",
        overrides: {
          ...chartOverrides,
          // Background and Grid
          "paneProperties.background": "#171717",
          "paneProperties.backgroundType": "solid",
          "paneProperties.vertGridProperties.color": "#262626",
          "paneProperties.horzGridProperties.color": "#262626",
          "paneProperties.crossHairProperties.color": "#4ADE80",
          "paneProperties.rightMargin": 5,
          "paneProperties.leftMargin": 5,

          // Scales
          "scalesProperties.backgroundColor": "#171717",
          "scalesProperties.lineColor": "#262626",
          "scalesProperties.textColor": "#8C8C8C",
          "scalesProperties.fontSize": 11,
          "scalesProperties.showSymbolLabels": false,

          // Price Axis
          priceScaleSelectionStrategyName: "right",

          // Legend
          "paneProperties.legendProperties.showSeriesTitle": false,
          "paneProperties.legendProperties.showVolume": true,

          // Candles
          "mainSeriesProperties.candleStyle.upColor": "#4ADE80",
          "mainSeriesProperties.candleStyle.downColor": "#FF4444",
          "mainSeriesProperties.candleStyle.drawWick": true,
          "mainSeriesProperties.candleStyle.drawBorder": true,
          "mainSeriesProperties.candleStyle.borderUpColor": "#4ADE80",
          "mainSeriesProperties.candleStyle.borderDownColor": "#FF4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#4ADE80",
          "mainSeriesProperties.candleStyle.wickDownColor": "#FF4444",

          // Volume
          "volume.show": true,
          "volume.color.up": "#4ADE80",
          "volume.color.down": "#FF4444",
          "volume.transparency": 50,

          // Header
          "header_widget.background": "#171717",
          "header_widget.style.color": "#8C8C8C",
          "header_widget.buttons.color": "#8C8C8C",
          "header_widget.buttons.backgroundColor": "#171717",
          "header_widget.buttons.borderColor": "#262626",
          "header_widget.buttons.fontSize": 11,

          // Chart Type
          "mainSeriesProperties.style": chartType,
        },
        interval: "1D" as ResolutionString,
      };

      tvWidgetRef.current = new widget(widgetOptions);
      tvWidgetRef.current.onChartReady(function () {
        setIsLoading(false);
        const chart = tvWidgetRef.current?.activeChart();
        const priceScale = chart?.getPanes()[0].getMainSourcePriceScale();
        priceScale?.setAutoScale(true);

        // Create custom header toolbar
        const header = document.createElement("div");
        header.className =
          "flex items-center justify-between px-4 py-2 bg-[#171717] border-b border-[#262626]";

        // Left section: Time frames and chart types
        const leftSection = document.createElement("div");
        leftSection.className = "flex items-center gap-6";

        // Time frames
        const timeFrames = document.createElement("div");
        timeFrames.className = "flex items-center gap-2";
        TIME_FRAMES.forEach(({ label, resolution }) => {
          const button = document.createElement("button");
          button.className =
            "px-3 py-1 text-[#8C8C8C] hover:text-white text-sm font-medium";
          button.textContent = label;
          button.onclick = () => chart?.setResolution(resolution);
          timeFrames.appendChild(button);
        });

        // Chart types
        const chartTypes = document.createElement("div");
        chartTypes.className =
          "flex items-center gap-4 border-l border-[#262626] pl-6";

        const types: { value: string; icon: LucideIcon }[] = [
          { icon: CandlestickChart, value: "Candlestick" },
          { icon: LineChart, value: "Line" },
          { icon: BarChart3, value: "Bars" },
        ];

        types.forEach(({ value }) => {
          const button = document.createElement("button");
          button.className = "text-[#8C8C8C] hover:text-white";
          button.onclick = () => {
            setChartType(value);
            chart?.setChartType(value as unknown as SeriesType);
          };
          chartTypes.appendChild(button);
        });

        leftSection.appendChild(timeFrames);
        leftSection.appendChild(chartTypes);

        header.appendChild(leftSection);
        chartContainerRef.current.prepend(header);
      });

      return () => {
        if (tvWidgetRef.current) {
          tvWidgetRef.current.remove();
        }
      };
    }
  }, [name, pairIndex]);

  return (
    <div className="relative h-full w-full bg-[#171717] rounded-xl overflow-hidden">
      {isLoading ? (
        <div className="z-50 absolute left-0 top-0 flex h-full w-full items-center justify-center bg-[#171717]">
          <ReactLoading
            height={20}
            width={50}
            type={"bars"}
            color={"#4ADE80"}
          />
        </div>
      ) : null}
      <div ref={chartContainerRef} className={twMerge("h-full w-full")} />
    </div>
  );
};
