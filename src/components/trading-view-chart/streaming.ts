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

socket.on("newCandle", (data: any) => {
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
  _symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onRealtimeCallback: SubscribeBarsCallback,
  subscriberUID: string,
  _onResetCacheNeededCallback: () => void,
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
        channelToSubscription.delete(pairIndex);
        break;
      }
    }
  }
}
