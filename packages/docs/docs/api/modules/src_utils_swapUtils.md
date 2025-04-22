---
id: "src_utils_swapUtils"
title: "Module: src/utils/swapUtils"
sidebar_label: "src/utils/swapUtils"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / src/utils/swapUtils

## Functions

### calculateAmountOutSell

▸ **calculateAmountOutSell**(`reserveLamport`, `amount`, `_tokenDecimals`, `platformSellFee`, `reserveToken`): `number`

Calculates the amount of SOL received when selling tokens

#### Parameters

| Name | Type |
| :------ | :------ |
| `reserveLamport` | `number` |
| `amount` | `number` |
| `_tokenDecimals` | `number` |
| `platformSellFee` | `number` |
| `reserveToken` | `number` |

#### Returns

`number`

___

### getJupiterSwapIx

▸ **getJupiterSwapIx**(`user`, `_token`, `amount`, `style`, `slippageBps?`, `_connection`): `Promise`\<`any`[]\>

Implements swapping via the Jupiter API.

For buys, we swap SOL for a token.
For sells, we swap the token for SOL.

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `user` | `PublicKey` | `undefined` |
| `_token` | `PublicKey` | `undefined` |
| `amount` | `number` | `undefined` |
| `style` | `number` | `undefined` |
| `slippageBps` | `number` | `100` |
| `_connection` | `Connection` | `undefined` |

#### Returns

`Promise`\<`any`[]\>
