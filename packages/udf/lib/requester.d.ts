import { RequestParams, UdfResponse, UdfErrorResponse } from './helpers';
import { IRequester } from './irequester';
export declare class Requester implements IRequester {
    private _headers;
    constructor(headers?: HeadersInit);
    sendRequest<T extends UdfResponse>(datafeedUrl: string, urlPath: string, params?: RequestParams): Promise<T | UdfErrorResponse>;
    sendRequest<T>(datafeedUrl: string, urlPath: string, params?: RequestParams): Promise<T>;
}
//# sourceMappingURL=requester.d.ts.map