"use client";

import React, { useEffect, useRef, memo } from "react";

const TradingViewWidget = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clean up any existing widgets first
    if (container.current?.querySelector("script")) {
      return;
    }

    if (container.current) {
      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "autosize": true,
          "symbol": "AAPL",
          "interval": "D",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "allow_symbol_change": true,
          "calendar": false,
          "support_host": "https://www.tradingview.com",
          "height": "500"
        }`;
      container.current.appendChild(script);
    }
  }, []);

  return (
    <div
      className="tradingview-widget-container rounded-xl overflow-hidden p-4 bg-[#401141]"
      ref={container}
    >
      <div className="tradingview-widget-container__widget h-[500px]" />
    </div>
  );
};

export const TokenGraph = memo(TradingViewWidget);
