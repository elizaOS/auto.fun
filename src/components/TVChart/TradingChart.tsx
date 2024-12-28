"use client"

import dynamic from "next/dynamic";
import { useState } from "react";
import Script from "next/script";
import { coinInfo } from "@/utils/types";

interface TradingChartProps {
    param: coinInfo
}

const TVChartContainer = dynamic(
    () =>
        import("@/components/TVChart/TVChartContainer").then((mod) => mod.TVChartContainer),
    { ssr: false }
);

export const TradingChart: React.FC<TradingChartProps> = ({ param }) => {

    const [isScriptReady, setIsScriptReady] = useState(false);
    
    console.log("tradingview chart", param)

    return (
        <>
            {/* <Head>
                <title>Sample Demo TradingView with NextJS</title>
            </Head> */}
            {/* <Script
        src="/libraries/charting_library/charting_library.standalone.js"
        strategy="lazyOnload"
      /> */}
            <Script
                src="/libraries/datafeeds/udf/dist/bundle.js"
                strategy="lazyOnload"
                onReady={() => {
                    setIsScriptReady(true);
                }}
            />
            {isScriptReady && param && <TVChartContainer
                name = {param.name}
                pairIndex = {10}
                token = {param.mint}
            />}
        </>
    );
}