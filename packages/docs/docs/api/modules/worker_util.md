---
id: "worker_util"
title: "Module: worker/util"
sidebar_label: "worker/util"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/util

## Functions

### createNewTokenData

▸ **createNewTokenData**(`txId`, `tokenAddress`, `creatorAddress`, `env?`): `Promise`\<`Partial`\<`Token`\>\>

Creates a new token record with all required data

#### Parameters

| Name | Type |
| :------ | :------ |
| `txId` | `string` |
| `tokenAddress` | `string` |
| `creatorAddress` | `string` |
| `env?` | [`Env`](../interfaces/worker_env.Env.md) |

#### Returns

`Promise`\<`Partial`\<`Token`\>\>

___

### bulkUpdatePartialTokens

▸ **bulkUpdatePartialTokens**(`tokens`, `env`): `Promise`\<`Token`[]\>

Updates a list of token objects with calculated market data

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `tokens` | \{ `name`: `string` ; `url`: `string` ; `ticker`: `string` ; `createdAt`: `string` ; `mint`: `string` ; `image`: `string` ; `marketCapUSD`: ``null`` \| `number` ; `currentPrice`: ``null`` \| `number` ; `curveProgress`: ``null`` \| `number` ; `status`: `string` ; `liquidity`: ``null`` \| `number` ; `curveLimit`: ``null`` \| `number` ; `reserveLamport`: ``null`` \| `number` ; `virtualReserves`: ``null`` \| `number` ; `solPriceUSD`: ``null`` \| `number` ; `holderCount`: ``null`` \| `number` ; `description`: ``null`` \| `string` ; `discord`: ``null`` \| `string` ; `twitter`: ``null`` \| `string` ; `telegram`: ``null`` \| `string` ; `farcaster`: ``null`` \| `string` ; `creator`: `string` ; `volume24h`: ``null`` \| `number` ; `website`: ``null`` \| `string` ; `tokenPriceUSD`: ``null`` \| `number` ; `tokenSupplyUiAmount`: ``null`` \| `number` ; `tokenDecimals`: ``null`` \| `number` ; `nftMinted`: ``null`` \| `string` ; `lockId`: ``null`` \| `string` ; `lockedAmount`: ``null`` \| `string` ; `lockedAt`: ``null`` \| `string` ; `harvestedAt`: ``null`` \| `string` ; `completedAt`: ``null`` \| `string` ; `withdrawnAt`: ``null`` \| `string` ; `migratedAt`: ``null`` \| `string` ; `marketId`: ``null`` \| `string` ; `baseVault`: ``null`` \| `string` ; `quoteVault`: ``null`` \| `string` ; `withdrawnAmount`: ``null`` \| `number` ; `reserveAmount`: ``null`` \| `number` ; `priceChange24h`: ``null`` \| `number` ; `price24hAgo`: ``null`` \| `number` ; `inferenceCount`: ``null`` \| `number` ; `lastVolumeReset`: ``null`` \| `string` ; `lastPriceUpdate`: ``null`` \| `string` ; `txId`: ``null`` \| `string` ; `lastUpdated`: `string` ; `imported`: ``null`` \| `number` ; `verified`: ``null`` \| `number` ; `featured`: ``null`` \| `number` ; `hidden`: ``null`` \| `number` ; `id`: `string` ; `tokenSupply`: ``null`` \| `string` ; `migration`: ``null`` \| `string` ; `withdrawnAmounts`: ``null`` \| `string` ; `poolInfo`: ``null`` \| `string` ; `lockLpTxId`: ``null`` \| `string` ; `lastSupplyUpdate`: ``null`` \| `string`  }[] | Array of token objects from database |
| `env` | [`Env`](../interfaces/worker_env.Env.md) | Cloudflare worker environment |

#### Returns

`Promise`\<`Token`[]\>

Array of tokens with updated market data

___

### getFeaturedMaxValues

▸ **getFeaturedMaxValues**(`db`): `Promise`\<\{ `maxVolume`: `number` ; `maxHolders`: `number`  }\>

Gets the maximum values needed for featured sorting

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `db` | `any` | Database instance |

#### Returns

`Promise`\<\{ `maxVolume`: `number` ; `maxHolders`: `number`  }\>

Object containing maxVolume and maxHolders values for normalization

___

### getFeaturedScoreExpression

▸ **getFeaturedScoreExpression**(`maxVolume`, `maxHolders`): `SQL`\<`unknown`\>

Creates a SQL expression for calculating the weighted featured score

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `maxVolume` | `number` | Maximum volume value for normalization |
| `maxHolders` | `number` | Maximum holder count for normalization |

#### Returns

`SQL`\<`unknown`\>

SQL expression for calculating the weighted score

___

### calculateFeaturedScore

▸ **calculateFeaturedScore**(`token`, `maxVolume`, `maxHolders`): `number`

Calculates the weighted score for a token using JavaScript
This function matches the SQL logic for consistency

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `token` | `Object` | Token object with volume24h and holderCount properties |
| `token.ticker` | `string` | - |
| `token.featured` | ``null`` \| `number` | - |
| `token.imported` | ``null`` \| `number` | - |
| `token.volume24h?` | ``null`` \| `number` | - |
| `token.holderCount?` | ``null`` \| `number` | - |
| `token.createdAt` | `string` | - |
| `maxVolume` | `number` | Maximum volume value for normalization |
| `maxHolders` | `number` | Maximum holder count for normalization |

#### Returns

`number`

Calculated weighted score

___

### applyFeaturedSort

▸ **applyFeaturedSort**(`tokensQuery`, `maxVolume`, `maxHolders`, `sortOrder`): `any`

Applies a weighted sort for the "featured" tokens
Uses 70% weight on volume24h and 30% weight on holderCount

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `tokensQuery` | `any` | Current tokens query that needs sorting applied |
| `maxVolume` | `number` | Maximum volume value for normalization |
| `maxHolders` | `number` | Maximum holder count for normalization |
| `sortOrder` | `string` | Sort direction ("asc" or "desc") |

#### Returns

`any`

Updated tokens query with the weighted sorting applied
