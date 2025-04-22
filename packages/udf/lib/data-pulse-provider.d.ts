import { LibrarySymbolInfo, ResolutionString, SubscribeBarsCallback } from '../../../public/libraries/charting_library/datafeed-api';
import { IDataPulseProvider, IHistoryProvider } from './provider-interfaces';
export declare class DataPulseProvider implements IDataPulseProvider {
    private readonly _subscribers;
    private _requestsPending;
    private readonly _historyProvider;
    constructor(historyProvider: IHistoryProvider, updateFrequency: number);
    subscribeBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, newDataCallback: SubscribeBarsCallback, listenerGuid: string): void;
    unsubscribeBars(listenerGuid: string): void;
    private _updateData;
    private _updateDataForSubscriber;
    private _onSubscriberDataReceived;
}
//# sourceMappingURL=data-pulse-provider.d.ts.map