export type ChartTable = {
    table: {
        open: number;
        high: number;
        low: number;
        close: number;
        time: number;
    }[];
};

export type Chart = {
    time: number;
    opens: number[];
    highs: number[];
    lows: number[];
    closes: number[];
};

export interface userInfo {
    _id?: string,
    name: string,
    wallet: string,
    avatar?: string,
    isLedger?: boolean,
    signature?: string,
}

export interface coinInfo {
    name: string,
    mint: string,
    creator?: string,
    ticker: string,
    url: string,
    reserveLamport: number,
    reserveAmount?: number,
    marketcapUSD?: number,
    description?: string,
    twitter?: string,
    createdAt?: string,
    status: string,
}

export interface CharTable {
    table: {
        time: number;
        low: number;
        high: number;
        open: number;
        close: number;
        volume: number;
    }[];
}

export interface Bar {
    time: number;
    low: number;
    high: number;
    open: number;
    close: number;
    volume: number;
}