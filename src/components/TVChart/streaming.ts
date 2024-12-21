"use client";

import { io, Socket } from "socket.io-client";
import type {
    Bar,
    LibrarySymbolInfo,
    ResolutionString,
    SubscribeBarsCallback,
} from "@/libraries/charting_library";

import { CONTRACT_API_URL } from "@/utils/env";

export let socket: Socket | undefined = undefined;

if (typeof window !== "undefined") {
    socket = io(CONTRACT_API_URL);
}

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

if (socket) {
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
            volume: data.volume
        };
    
        for (const pairIndex of channelToSubscription.keys()) {
            const subscriptionItem = channelToSubscription.get(pairIndex);
            if (!subscriptionItem) continue;
    
            const lastBar = subscriptionItem.lastBar;
            const nextBarTime = getNextBarTime(lastBar.time, +subscriptionItem.resolution);
    
            if (bar.time >= nextBarTime) {
                // This is a new bar
                const newBar: Bar = {
                    time: bar.time,
                    open: bar.close,  // For a new bar, set open to the first price
                    high: bar.close,
                    low: bar.close,
                    close: bar.close,
                    volume: bar.volume || 0
                };
                subscriptionItem.lastBar = newBar;
            } else {
                // Update existing bar
                const updatedBar: Bar = {
                    ...lastBar,
                    high: Math.max(lastBar.high, bar.close),
                    low: Math.min(lastBar.low, bar.close),
                    close: bar.close,
                    volume: (lastBar.volume || 0) + (bar.volume || 0)
                };
                subscriptionItem.lastBar = updatedBar;
            }

            console.log("[socket] New bar received", subscriptionItem.lastBar);
    
            // Send data to every subscriber of that symbol
            subscriptionItem.handlers.forEach((handler) => 
                handler.callback(subscriptionItem.lastBar)
            );
        }
    });
    //     const tradeTime = new Date().getTime();

    //     const state = queryClient.getQueryState<Chart>(["charts"]);

    //     if (!state || !state.data || !priceUpdates) {
    //         return;
    //     }

    //     for (let i = 0; i < priceUpdates.length; i += 2) {
    //         const index = priceUpdates[i];
    //         const price = priceUpdates[i + 1];

    //         if (state.data.closes.length < index) {
    //             while (state.data.closes.length < index) state.data.closes.push(0);
    //         }

    //         state.data.closes[index] = price;
    //     }

    //     for (const pairIndex of channelToSubscription.keys()) {
    //         const subscriptionItem = channelToSubscription.get(pairIndex);

    //         if (!subscriptionItem) {
    //             continue;
    //         }

    //         const lastBar = subscriptionItem.lastBar;
    //         const resolution = subscriptionItem.resolution;
    //         const nextBarTime = getNextBarTime(lastBar.time, +resolution);

    //         let bar: Bar;

    //         if (tradeTime >= nextBarTime) {
    //             bar = {
    //                 time: nextBarTime,
    //                 open: state.data.closes[pairIndex],
    //                 high: state.data.closes[pairIndex],
    //                 low: state.data.closes[pairIndex],
    //                 close: state.data.closes[pairIndex],
    //             };
    //             console.log("[socket] Generate new bar", bar);
    //         } else {
    //             bar = {
    //                 ...lastBar,
    //                 high: Math.max(lastBar.high, state.data.closes[pairIndex]),
    //                 low: Math.min(lastBar.low, state.data.closes[pairIndex]),
    //                 close: state.data.closes[pairIndex],
    //             };
    //         }
    //         subscriptionItem.lastBar = bar;

    //         // Send data to every subscriber of that symbol
    //         subscriptionItem.handlers.forEach((handler) => handler.callback(bar));
    //     }

    //     queryClient.setQueryData<Chart | undefined>(["charts"], (oldData) => {
    //         if (!oldData) {
    //             return oldData;
    //         }

    //         const priceData: Chart = {
    //             ...oldData,
    //             time: tradeTime,
    //         };

    //         for (let i = 0; i < priceUpdates.length; i += 2) {
    //             const index = priceUpdates[i];
    //             const price = priceUpdates[i + 1];

    //             if (priceData.closes.length < index) {
    //                 while (priceData.closes.length < index) priceData.closes.push(0);
    //             }

    //             priceData.closes[index] = price;
    //         }

    //         return priceData;
    //     });
    // });
}

// barTime is millisec, resolution is mins
function getNextBarTime(barTime: number, resolution: number) {
    const previousSegment = Math.floor(barTime / 1000 / 60 / resolution);
    return (previousSegment + 1) * 1000 * 60 * resolution;
}

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
                // socket.emit("SubRemove", { subs: [channelString] });
                channelToSubscription.delete(pairIndex);
                break;
            }
        }
    }
}
