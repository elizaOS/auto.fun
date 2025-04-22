---
id: "worker_cache.CacheService"
title: "Class: CacheService"
sidebar_label: "CacheService"
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / [worker/cache](../modules/worker_cache.md) / CacheService

[worker/cache](../modules/worker_cache.md).CacheService

Unified cache system using Drizzle/D1 for all caching needs
Simplifies the architecture by avoiding additional services like KV

## Methods

### getSolPrice

▸ **getSolPrice**(): `Promise`\<``null`` \| `number`\>

Get SOL price from cache

#### Returns

`Promise`\<``null`` \| `number`\>

___

### setSolPrice

▸ **setSolPrice**(`price`, `ttlSeconds?`): `Promise`\<`void`\>

Store SOL price in cache

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `price` | `number` | `undefined` | SOL price in USD |
| `ttlSeconds` | `number` | `30` | How long the cache should live (in seconds) |

#### Returns

`Promise`\<`void`\>

___

### getTokenPrice

▸ **getTokenPrice**(`mint`): `Promise`\<``null`` \| `number`\>

Get token price from cache

#### Parameters

| Name | Type |
| :------ | :------ |
| `mint` | `string` |

#### Returns

`Promise`\<``null`` \| `number`\>

___

### setTokenPrice

▸ **setTokenPrice**(`mint`, `price`, `ttlSeconds?`): `Promise`\<`void`\>

Store token price in cache

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `mint` | `string` | `undefined` |
| `price` | `number` | `undefined` |
| `ttlSeconds` | `number` | `300` |

#### Returns

`Promise`\<`void`\>

___

### setMetadata

▸ **setMetadata**(`key`, `data`, `ttlSeconds?`): `Promise`\<`void`\>

Store any metadata object in cache

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `key` | `string` | `undefined` |
| `data` | `any` | `undefined` |
| `ttlSeconds` | `number` | `3600` |

#### Returns

`Promise`\<`void`\>

___

### getMetadata

▸ **getMetadata**\<`T`\>(`key`): `Promise`\<``null`` \| `T`\>

Get metadata from cache

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `key` | `string` |

#### Returns

`Promise`\<``null`` \| `T`\>
