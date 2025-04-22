---
id: "worker_codex"
title: "Module: worker/codex"
sidebar_label: "worker/codex"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/codex

## Interfaces

- [CodexBarsResponse](../interfaces/worker_codex.CodexBarsResponse.md)
- [CandleData](../interfaces/worker_codex.CandleData.md)

## Type Aliases

### CodexBarResolution

Ƭ **CodexBarResolution**: ``"1"`` \| ``"5"`` \| ``"15"`` \| ``"30"`` \| ``"60"`` \| ``"240"`` \| ``"720"`` \| ``"1D"`` \| ``"1W"`` \| ``"1M"``

Resolution type for Codex getBars API
Possible values: '1', '5', '15', '30', '60', '240', '720', '1D', '1W', '1M'

## Functions

### fetchCodexTokenEvents

▸ **fetchCodexTokenEvents**(`tokenAddress`, `startTimestamp`, `endTimestamp`, `networkId?`, `env?`): `Promise`\<`CodexTokenEvent`[]\>

Fetches token events from the Codex API

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `tokenAddress` | `string` | `undefined` | Token address to fetch events for |
| `startTimestamp` | `number` | `undefined` | Start timestamp in seconds |
| `endTimestamp` | `number` | `undefined` | End timestamp in seconds |
| `networkId` | `number` | `1399811149` | Network ID (default: 1399811149 for Solana) |
| `env?` | `any` | `undefined` | Environment variables containing CODEX_API_KEY |

#### Returns

`Promise`\<`CodexTokenEvent`[]\>

Array of token events

___

### fetchCodexTokenPrice

▸ **fetchCodexTokenPrice**(`tokenAddress`, `networkId?`, `env?`): `Promise`\<\{ `currentPrice`: `number` ; `priceUsd`: `number` ; `volume24h`: `number` ; `liquidity`: `number` ; `marketCap`: `number`  }\>

Fetches current token price and market data from Codex API

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `tokenAddress` | `string` | `undefined` | Token address to fetch price for |
| `networkId` | `number` | `1399811149` | Network ID (default: 1399811149 for Solana) |
| `env?` | `any` | `undefined` | Environment variables containing CODEX_API_KEY |

#### Returns

`Promise`\<\{ `currentPrice`: `number` ; `priceUsd`: `number` ; `volume24h`: `number` ; `liquidity`: `number` ; `marketCap`: `number`  }\>

Object with current price and market data

___

### convertCodexEventsToPriceFeed

▸ **convertCodexEventsToPriceFeed**(`events`): \{ `price`: `number` ; `timestamp`: `Date` ; `volume`: `number`  }[]

Converts Codex token events to price feed format

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `events` | `CodexTokenEvent`[] | Array of Codex token events |

#### Returns

\{ `price`: `number` ; `timestamp`: `Date` ; `volume`: `number`  }[]

Array of price feed objects

___

### fetchCodexBars

▸ **fetchCodexBars**(`tokenAddress`, `startTimestamp`, `endTimestamp`, `resolution?`, `networkId?`, `quoteToken?`, `env?`): `Promise`\<[`CandleData`](../interfaces/worker_codex.CandleData.md)[]\>

Fetch candlestick/OHLC data from Codex API's getBars endpoint

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `tokenAddress` | `string` | `undefined` | Token address to fetch candles for (defaults to hardcoded value) |
| `startTimestamp` | `number` | `undefined` | Start timestamp in seconds |
| `endTimestamp` | `number` | `undefined` | End timestamp in seconds |
| `resolution` | [`CodexBarResolution`](worker_codex.md#CodexBarResolution) | `"1"` | Candle resolution (1min, 5min, 15min, etc.) |
| `networkId` | `number` | `1399811149` | Network ID (default: 1399811149 for Solana) |
| `quoteToken` | `string` | `"token1"` | Quote token to use for price calculation (default: token1) |
| `env?` | `any` | `undefined` | Environment variables containing CODEX_API_KEY |

#### Returns

`Promise`\<[`CandleData`](../interfaces/worker_codex.CandleData.md)[]\>

Processed candle data in our application's format
