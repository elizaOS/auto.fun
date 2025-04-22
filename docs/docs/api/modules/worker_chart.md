---
id: "worker_chart"
title: "Module: worker/chart"
sidebar_label: "worker/chart"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/chart

## Functions

### fetchLockedTokenChartData

▸ **fetchLockedTokenChartData**(`token`, `start`, `end`, `range`, `_env`): `Promise`\<`any`[]\>

Fetch price chart data for locked tokens using Codex API

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `token` | `string` | The token mint address |
| `start` | `number` | Start time in milliseconds |
| `end` | `number` | End time in milliseconds |
| `range` | `number` | Time range in minutes for each candle |
| `_env` | [`Env`](../interfaces/worker_env.Env.md) | - |

#### Returns

`Promise`\<`any`[]\>

Array of OHLC candle data

___

### groupCandlesByRange

▸ **groupCandlesByRange**(`candles`, `rangeMinutes`): `Candle`[]

Group candles by the specified time range

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `candles` | `Candle`[] | Original candle data |
| `rangeMinutes` | `number` | Time range in minutes |

#### Returns

`Candle`[]

Grouped candle data
