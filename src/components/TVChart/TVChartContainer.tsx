"use client";
import { useContext, useEffect, useRef } from "react";
import {
  ChartingLibraryWidgetOptions,
  IChartingLibraryWidget,
  ResolutionString,
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
  const chartContainerRef =
    useRef<HTMLDivElement>() as React.MutableRefObject<HTMLInputElement>;
  const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);
  const { isLoading, setIsLoading } = useContext(UserContext);

  useEffect(() => {
    if (!chartContainerRef.current) {
      return () => {};
    }
    if (tvWidgetRef.current) {
      tvWidgetRef.current.remove();
    }
    const elem = chartContainerRef.current;
    // console.log("localhost host", location.host)
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
          backgroundColor: "#111114",
          foregroundColor: "#111114",
        },
        enabled_features: enabledFeatures,
        disabled_features: disabledFeatures,
        client_id: "tradingview.com",
        user_id: "public_user_id",
        fullscreen: false,
        autosize: true,
        custom_css_url: "/tradingview-chart.css",
        overrides: {
          ...chartOverrides,
          "paneProperties.rightMargin": 5,
          "paneProperties.leftMargin": 5,
          priceScaleSelectionStrategyName: "right",
          "mainSeriesProperties.barStyle.upColor": "#089981",
          "scalesProperties.showSymbolLabels": false,
          "paneProperties.legendProperties.showSeriesTitle": false,
          "paneProperties.legendProperties.showVolume": true,
          "mainSeriesProperties.barStyle.downColor": "#F23645",
          "mainSeriesProperties.barStyle.barColorsOnPrevClose": false,
          "mainSeriesProperties.barStyle.drawBody": true,
          "volume.show": true,
          "volume.color.up": "#089981",
          "volume.color.down": "#F23645",
        },
        interval: "1D" as ResolutionString,
      };

      tvWidgetRef.current = new widget(widgetOptions);
      tvWidgetRef.current.onChartReady(function () {
        setIsLoading(false);
        const priceScale = tvWidgetRef.current
          ?.activeChart()
          .getPanes()[0]
          .getMainSourcePriceScale();
        priceScale?.setAutoScale(true);
      });

      return () => {
        if (tvWidgetRef.current) {
          tvWidgetRef.current.remove();
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pairIndex]);

  return (
    <div className="relative mb-[1px] h-[500px] w-full bg-[#171717] border border-[#262626] rounded-xl p-2">
      {isLoading ? (
        <div className="z-9999 absolute left-0 top-0 flex h-full w-full items-center justify-center bg-tizz-background">
          <ReactLoading
            height={20}
            width={50}
            type={"bars"}
            color={"#36d7b7"}
          />
        </div>
      ) : null}
      <div
        ref={chartContainerRef}
        className={twMerge("h-full w-full overflow-hidden")}
      />
    </div>
  );
};
