import { IQuotesProvider } from './iquotes-provider';
import { QuoteData } from '../../../public/libraries/charting_library/datafeed-api';
import { IRequester } from './irequester';
export declare class QuotesProvider implements IQuotesProvider {
    private readonly _datafeedUrl;
    private readonly _requester;
    constructor(datafeedUrl: string, requester: IRequester);
    getQuotes(symbols: string[]): Promise<QuoteData[]>;
}
//# sourceMappingURL=quotes-provider.d.ts.map