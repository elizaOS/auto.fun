---
id: "worker_auth"
title: "Module: worker/auth"
sidebar_label: "worker/auth"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/auth

## Functions

### hashWithSalt

▸ **hashWithSalt**(`input`, `salt`): `string`

Generates a secure hash for the provided input using the salt from environment

#### Parameters

| Name | Type |
| :------ | :------ |
| `input` | `string` |
| `salt` | `string` |

#### Returns

`string`

___

### generateTokenId

▸ **generateTokenId**(`publicKey`): `string`

Creates a token ID that can be used for lookup

#### Parameters

| Name | Type |
| :------ | :------ |
| `publicKey` | `string` |

#### Returns

`string`

___

### generateWalletKey

▸ **generateWalletKey**(`publicKey`, `salt`): `string`

Generates the KV key for a wallet's tokens

#### Parameters

| Name | Type |
| :------ | :------ |
| `publicKey` | `string` |
| `salt` | `string` |

#### Returns

`string`

___

### generateTokenKey

▸ **generateTokenKey**(`tokenId`, `salt`): `string`

Generates the KV key for a specific token

#### Parameters

| Name | Type |
| :------ | :------ |
| `tokenId` | `string` |
| `salt` | `string` |

#### Returns

`string`

___

### createAuthToken

▸ **createAuthToken**(`env`, `publicKey`, `privileges?`): `Promise`\<`string`\>

Creates and stores an auth token for a wallet

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) | `undefined` |
| `publicKey` | `string` | `undefined` |
| `privileges` | `string`[] | `[]` |

#### Returns

`Promise`\<`string`\>

___

### validateAuthToken

▸ **validateAuthToken**(`env`, `token`): `Promise`\<`AuthTokenData` \| ``null``\>

Validates an auth token and returns the token data if valid

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `token` | `string` |

#### Returns

`Promise`\<`AuthTokenData` \| ``null``\>

___

### revokeAllWalletTokens

▸ **revokeAllWalletTokens**(`env`, `publicKey`): `Promise`\<`boolean`\>

Revokes all tokens for a wallet

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `publicKey` | `string` |

#### Returns

`Promise`\<`boolean`\>

___

### revokeToken

▸ **revokeToken**(`env`, `token`): `Promise`\<`boolean`\>

Revokes a specific token

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `token` | `string` |

#### Returns

`Promise`\<`boolean`\>

___

### verifyAuth

▸ **verifyAuth**(`c`, `next`): `Promise`\<`any`\>

http only cookie cannot be tampered with, so we can trust it

#### Parameters

| Name | Type |
| :------ | :------ |
| `c` | `Context`\<\{ `Bindings`: [`Env`](../interfaces/worker_env.Env.md)  }, `any`, {}\> |
| `next` | `Function` |

#### Returns

`Promise`\<`any`\>
