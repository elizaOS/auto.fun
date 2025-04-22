---
id: "src_utils_auth"
title: "Module: src/utils/auth"
sidebar_label: "src/utils/auth"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / src/utils/auth

## Functions

### sanitizeToken

▸ **sanitizeToken**(`token`): ``null`` \| `string`

Sanitizes a token by removing any surrounding quotes
Can be used to clean tokens from localStorage

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | ``null`` \| `string` |

#### Returns

``null`` \| `string`

___

### getAuthToken

▸ **getAuthToken**(): ``null`` \| `string`

Retrieves the authentication token from localStorage and ensures it's properly formatted
(without quotes)

#### Returns

``null`` \| `string`

___

### parseJwt

▸ **parseJwt**(`token`): `any`

Parses a JWT token and extracts its payload

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | `string` |

#### Returns

`any`

___

### isTokenExpired

▸ **isTokenExpired**(`token`): `boolean`

Checks if a JWT token is expired

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | ``null`` \| `string` |

#### Returns

`boolean`

true if token is expired or invalid, false if still valid
