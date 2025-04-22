export interface RequestParams {
    [paramName: string]: string | string[] | number;
}
export interface UdfResponse {
    s: string;
}
export interface UdfOkResponse extends UdfResponse {
    s: 'ok';
}
export interface UdfErrorResponse {
    s: 'error';
    errmsg: string;
}
export declare function logMessage(message: string): void;
export declare function getErrorMessage(error: string | Error | undefined): string;
//# sourceMappingURL=helpers.d.ts.map