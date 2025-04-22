import { DatafeedConfiguration, ErrorCallback, GetMarksCallback, HistoryCallback, IDatafeedChartApi, IDatafeedQuotesApi, IExternalDatafeed, LibrarySymbolInfo, Mark, OnReadyCallback, QuotesCallback, ResolutionString, ResolveCallback, SearchSymbolResultItem, SearchSymbolsCallback, ServerTimeCallback, SubscribeBarsCallback, TimescaleMark, SymbolResolveExtension, VisiblePlotsSet } from '../../../public/libraries/charting_library/datafeed-api';
import { LimitedResponseConfiguration, PeriodParamsWithOptionalCountback } from './history-provider';
import { IQuotesProvider } from './iquotes-provider';
import { IRequester } from './irequester';
export interface UdfCompatibleConfiguration extends DatafeedConfiguration {
    supports_search?: boolean;
    supports_group_request?: boolean;
    supported_resolutions?: ResolutionString[];
    supports_marks?: boolean;
    supports_timescale_marks?: boolean;
    supports_time?: boolean;
}
export interface ResolveSymbolResponse extends LibrarySymbolInfo {
    s: undefined;
    'exchange-listed': string;
    'exchange-traded': string;
    'currency-code': string;
    'unit-id': string;
    'original-currency-code': string;
    'original-unit-id': string;
    'unit-conversion-types': string[];
    'has-intraday': boolean;
    'visible-plots-set'?: VisiblePlotsSet;
    minmovement: number;
    minmovement2?: number;
    'session-regular': string;
    'session-holidays': string;
    'supported-resolutions': ResolutionString[];
    'has-daily': boolean;
    'intraday-multipliers': string[];
    'has-weekly-and-monthly'?: boolean;
    'has-empty-bars'?: boolean;
    'volume-precision'?: number;
}
export interface UdfSearchSymbolsResponse extends Array<SearchSymbolResultItem> {
    s?: undefined;
}
export declare const enum Constants {
    SearchItemsLimit = 30
}
/**
 * This class implements interaction with UDF-compatible datafeed.
 * See [UDF protocol reference](@docs/connecting_data/UDF)
 */
export declare class UDFCompatibleDatafeedBase implements IExternalDatafeed, IDatafeedQuotesApi, IDatafeedChartApi {
    protected _configuration: UdfCompatibleConfiguration;
    private readonly _datafeedURL;
    private readonly _configurationReadyPromise;
    private _symbolsStorage;
    private readonly _historyProvider;
    private readonly _dataPulseProvider;
    private readonly _quotesProvider;
    private readonly _quotesPulseProvider;
    private readonly _requester;
    protected constructor(datafeedURL: string, quotesProvider: IQuotesProvider, requester: IRequester, updateFrequency?: number, limitedServerResponse?: LimitedResponseConfiguration);
    onReady(callback: OnReadyCallback): void;
    getQuotes(symbols: string[], onDataCallback: QuotesCallback, onErrorCallback: (msg: string) => void): void;
    subscribeQuotes(symbols: string[], fastSymbols: string[], onRealtimeCallback: QuotesCallback, listenerGuid: string): void;
    unsubscribeQuotes(listenerGuid: string): void;
    getMarks(symbolInfo: LibrarySymbolInfo, from: number, to: number, onDataCallback: GetMarksCallback<Mark>, resolution: ResolutionString): void;
    getTimescaleMarks(symbolInfo: LibrarySymbolInfo, from: number, to: number, onDataCallback: GetMarksCallback<TimescaleMark>, resolution: ResolutionString): void;
    getServerTime(callback: ServerTimeCallback): void;
    searchSymbols(userInput: string, exchange: string, symbolType: string, onResult: SearchSymbolsCallback): void;
    resolveSymbol(symbolName: string, onResolve: ResolveCallback, onError: ErrorCallback, extension?: SymbolResolveExtension): void;
    getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, periodParams: PeriodParamsWithOptionalCountback, onResult: HistoryCallback, onError: ErrorCallback): void;
    subscribeBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, onTick: SubscribeBarsCallback, listenerGuid: string, _onResetCacheNeededCallback: () => void): void;
    unsubscribeBars(listenerGuid: string): void;
    protected _requestConfiguration(): Promise<UdfCompatibleConfiguration | null>;
    private _send;
    private _setupWithConfiguration;
}
//# sourceMappingURL=udf-compatible-datafeed-base.d.ts.map