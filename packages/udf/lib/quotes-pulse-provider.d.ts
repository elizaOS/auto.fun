import { QuotesCallback } from '../../../public/libraries/charting_library/datafeed-api';
import { IQuotesProvider } from './iquotes-provider';
export declare class QuotesPulseProvider {
    private readonly _quotesProvider;
    private readonly _subscribers;
    private _requestsPending;
    private _timers;
    constructor(quotesProvider: IQuotesProvider);
    subscribeQuotes(symbols: string[], fastSymbols: string[], onRealtimeCallback: QuotesCallback, listenerGuid: string): void;
    unsubscribeQuotes(listenerGuid: string): void;
    private _createTimersIfRequired;
    private _destroyTimers;
    private _updateQuotes;
}
//# sourceMappingURL=quotes-pulse-provider.d.ts.map