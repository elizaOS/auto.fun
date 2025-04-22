---
id: "src_utils_jito"
title: "Module: src/utils/jito"
sidebar_label: "src/utils/jito"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / src/utils/jito

## Functions

### sendTxUsingJito

▸ **sendTxUsingJito**(`«destructured»`): `Promise`\<`any`\>

Send a transaction using Jito. This only supports sending a single transaction on mainnet only.
See https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/transactions-endpoint/sendtransaction.

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `«destructured»` | `Object` | `undefined` |
| › `serializedTx` | `number`[] \| `Uint8Array` \| `Buffer` | `undefined` |
| › `region` | `JitoRegion` | `"mainnet"` |

#### Returns

`Promise`\<`any`\>
