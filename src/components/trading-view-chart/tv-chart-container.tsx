import { useEffect, useRef } from "react";
import {
  ChartingLibraryWidgetOptions,
  IChartingLibraryWidget,
  ResolutionString,
  widget,
} from "@/libraries/charting_library";
import { chartOverrides, disabledFeatures, enabledFeatures } from "./constants";
import { getDataFeed } from "./datafeed";
import { twMerge } from "tailwind-merge";

export type TVChartContainerProps = {
  name: string;
  pairIndex: number;
  token: string;
  classNames?: {
    container: string;
  };
};

export const TVChartContainer = ({
  name,
  pairIndex,
  token,
}: TVChartContainerProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);

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
          "paneProperties.vertGridProperties.color": "#2e2e2e",
          "paneProperties.horzGridProperties.color": "#2e2e2e",
          "paneProperties.crossHairProperties.color": "#8C8C8C",
          "paneProperties.rightMargin": 5,
          "paneProperties.leftMargin": 5,

          // Scales
          "scalesProperties.backgroundColor": "#171717",
          "scalesProperties.lineColor": "#2e2e2e",
          "scalesProperties.textColor": "#8C8C8C",
          "scalesProperties.fontSize": 11,
          "scalesProperties.showSymbolLabels": false,

          // Price Axis
          priceScaleSelectionStrategyName: "right",

          // Legend
          "paneProperties.legendProperties.showSeriesTitle": false,
          "paneProperties.legendProperties.showVolume": true,

          // Candles
          "mainSeriesProperties.candleStyle.upColor": "#008e12",
          "mainSeriesProperties.candleStyle.downColor": "#ef5350",
          "mainSeriesProperties.candleStyle.drawWick": true,
          "mainSeriesProperties.candleStyle.drawBorder": true,
          "mainSeriesProperties.candleStyle.borderUpColor": "#008e12",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef5350",
          "mainSeriesProperties.candleStyle.wickUpColor": "#008e12",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef5350",

          // Price Line
          "mainSeriesProperties.priceLineColor": "#03FF24",

          // Volume
          "volume.show": true,
          "volume.color.up": "#008e12",
          "volume.color.down": "#ef5350",
          "volume.transparency": 50,

          // Header
          "header_widget.background": "#171717",
          "header_widget.style.color": "#8C8C8C",
          "header_widget.buttons.color": "#8C8C8C",
          "header_widget.buttons.backgroundColor": "#171717",
          "header_widget.buttons.borderColor": "#262626",
          "header_widget.buttons.fontSize": 11,
        },
        interval: "1D" as ResolutionString,
      };

      tvWidgetRef.current = new widget(widgetOptions);
      tvWidgetRef.current.onChartReady(() => {
        const chart = tvWidgetRef.current?.activeChart();
        const priceScale = chart?.getPanes()[0].getMainSourcePriceScale();
        priceScale?.setAutoScale(true);
      });

      return () => {
        if (tvWidgetRef.current) {
          tvWidgetRef.current.remove();
        }
      };
    }
  }, [name, pairIndex]);

  return (
    <div className="relative h-full w-full bg-autofun-background-primary overflow-hidden min-h-[50vh]">
      <div ref={chartContainerRef} className={twMerge("h-full w-full")} />
    </div>
  );
};
