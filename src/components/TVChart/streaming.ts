"use client";

import type {
  Bar,
  LibrarySymbolInfo,
  ResolutionString,
  SubscribeBarsCallback,
} from "@/libraries/charting_library";
import { getSocket } from "@/utils/socket";

type SubscriptionItem = {
  subscriberUID: string;
  resolution: ResolutionString;
  lastBar: Bar;
  handlers: {
    id: string;
    callback: SubscribeBarsCallback;
  }[];
  pairIndex: number;
};

const channelToSubscription = new Map<number, SubscriptionItem>();
const socket = getSocket();
socket.on("connect", () => {
  console.log("[socket] Connected", socket!.id);
  // initialTimeStamp = new Date().getTime();
});

socket.on("disconnect", (reason) => {
  console.log("[socket] Disconnected:", reason);
});

socket.on("connect_error", (error) => {
  if (socket!.active) {
    // temporary failure, the socket will automatically try to reconnect
  } else {
    // the connection was denied by the server
    // in that case, `socket.connect()` must be manually called in order to reconnect
    console.log("[socket] Error:", error.message);
  }
});

socket.on("newCandle", (data) => {
  const bar: Bar = {
    time: data.time * 1000,
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
    volume: data.volume,
  };

  for (const pairIndex of channelToSubscription.keys()) {
    const subscriptionItem = channelToSubscription.get(pairIndex);
    if (!subscriptionItem) continue;

    const lastBar = subscriptionItem.lastBar;

    const newBar: Bar = {
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume || 0,
    };

    const updatedLastBar: Bar = {
      ...lastBar,
      high: Math.max(lastBar.high, bar.close),
      low: Math.min(lastBar.low, bar.close),
      close: bar.close,
      volume: (lastBar.volume || 0) + (bar.volume || 0),
    };

    subscriptionItem.handlers.forEach((handler) =>
      handler.callback(updatedLastBar),
    );

    subscriptionItem.lastBar = newBar;
    subscriptionItem.handlers.forEach((handler) => handler.callback(newBar));
  }
});

export function subscribeOnStream(
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onRealtimeCallback: SubscribeBarsCallback,
  subscriberUID: string,
  onResetCacheNeededCallback: () => void,
  lastBar: Bar,
  pairIndex: number,
) {
  const handler = {
    id: subscriberUID,
    callback: onRealtimeCallback,
  };
  let subscriptionItem = channelToSubscription.get(pairIndex);
  if (subscriptionItem) {
    // Already subscribed to the channel, use the existing subscription
    subscriptionItem.handlers.push(handler);
    return;
  }

  subscriptionItem = {
    subscriberUID,
    resolution,
    lastBar,
    handlers: [handler],
    pairIndex,
  } as SubscriptionItem;
  channelToSubscription.set(pairIndex, subscriptionItem);
  console.log("[subscribeBars]: Subscribe to streaming. Channel:", pairIndex);
}

export function unsubscribeFromStream(subscriberUID: string) {
  // Find a subscription with id === subscriberUID
  for (const pairIndex of channelToSubscription.keys()) {
    const subscriptionItem = channelToSubscription.get(pairIndex);

    if (!subscriptionItem) {
      continue;
    }

    const handlerIndex = subscriptionItem.handlers.findIndex(
      (handler) => handler.id === subscriberUID,
    );

    if (handlerIndex !== -1) {
      // Remove from handlers
      subscriptionItem.handlers.splice(handlerIndex, 1);

      if (subscriptionItem.handlers.length === 0) {
        // Unsubscribe from the channel if it was the last handler
        console.log(
          "[unsubscribeBars]: Unsubscribe from streaming. Channel:",
          pairIndex,
        );
        channelToSubscription.delete(pairIndex);
        break;
      }
    }
  }
}
