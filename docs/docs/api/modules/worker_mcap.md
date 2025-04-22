---
id: "worker_mcap"
title: "Module: worker/mcap"
sidebar_label: "worker/mcap"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/mcap

## Functions

### getSOLPrice

▸ **getSOLPrice**(`env?`): `Promise`\<`number`\>

Get the current SOL price in USD
Prioritizes cache, then Pyth, then fallback APIs

#### Parameters

| Name | Type |
| :------ | :------ |
| `env?` | [`Env`](../interfaces/worker_env.Env.md) |

#### Returns

`Promise`\<`number`\>

___

### fetchSOLPriceFromPyth

▸ **fetchSOLPriceFromPyth**(): `Promise`\<`number`\>

Fetch SOL/USD price directly from Pyth Network

#### Returns

`Promise`\<`number`\>

___

### calculateTokenMarketData

▸ **calculateTokenMarketData**(`token`, `solPrice`, `env`): `Promise`\<`any`\>

Calculate token market data using SOL price

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | `any` |
| `solPrice` | `number` |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |

#### Returns

`Promise`\<`any`\>

___

### updateMigratedTokenMarketData

▸ **updateMigratedTokenMarketData**(`env?`): `Promise`\<`void`\>

Process a batch of tokens and update their market data
This approach is more compatible with Cloudflare Workers' stateless nature

#### Parameters

| Name | Type |
| :------ | :------ |
| `env?` | [`Env`](../interfaces/worker_env.Env.md) |

#### Returns

`Promise`\<`void`\>
