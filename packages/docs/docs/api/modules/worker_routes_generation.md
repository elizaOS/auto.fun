---
id: "worker_routes_generation"
title: "Module: worker/routes/generation"
sidebar_label: "worker/routes/generation"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/routes/generation

## Functions

### checkTokenOwnership

▸ **checkTokenOwnership**(`env`, `mint`, `publicKey`, `mode?`, `mediaType?`): `Promise`\<\{ `allowed`: `boolean` ; `message?`: `string`  }\>

Checks if a user owns the required minimum amount of tokens for generating content

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) | `undefined` |
| `mint` | `string` | `undefined` |
| `publicKey` | `string` | `undefined` |
| `mode` | ``"fast"`` \| ``"pro"`` | `"fast"` |
| `mediaType` | `MediaType` | `MediaType.IMAGE` |

#### Returns

`Promise`\<\{ `allowed`: `boolean` ; `message?`: `string`  }\>

___

### generateImage

▸ **generateImage**(`env`, `mint`, `prompt`, `negativePrompt?`, `creator?`): `Promise`\<[`MediaGeneration`](../interfaces/worker_types.MediaGeneration.md)\>

Generate an image using Fal.ai API

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `mint` | `string` |
| `prompt` | `string` |
| `negativePrompt?` | `string` |
| `creator?` | `string` |

#### Returns

`Promise`\<[`MediaGeneration`](../interfaces/worker_types.MediaGeneration.md)\>

___

### generateVideo

▸ **generateVideo**(`env`, `mint`, `prompt`, `negativePrompt?`, `creator?`): `Promise`\<[`MediaGeneration`](../interfaces/worker_types.MediaGeneration.md)\>

Generate a video using Fal.ai API

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `mint` | `string` |
| `prompt` | `string` |
| `negativePrompt?` | `string` |
| `creator?` | `string` |

#### Returns

`Promise`\<[`MediaGeneration`](../interfaces/worker_types.MediaGeneration.md)\>

___

### getDailyGenerationCount

▸ **getDailyGenerationCount**(`env`, `db`, `mint`, `creator`): `Promise`\<`number`\>

Get daily generation count and update if needed

#### Parameters

| Name | Type |
| :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) |
| `db` | `any` |
| `mint` | `string` |
| `creator` | `string` |

#### Returns

`Promise`\<`number`\>
