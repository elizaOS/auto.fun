import { QuoteData } from '../../../public/libraries/charting_library/datafeed-api';
import { UdfOkResponse } from './helpers';
export interface UdfQuotesResponse extends UdfOkResponse {
    d: QuoteData[];
}
export interface IQuotesProvider {
    getQuotes(symbols: string[]): Promise<QuoteData[]>;
}
//# sourceMappingURL=iquotes-provider.d.ts.map