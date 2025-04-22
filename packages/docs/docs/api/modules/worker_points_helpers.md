---
id: "worker_points_helpers"
title: "Module: worker/points/helpers"
sidebar_label: "worker/points/helpers"
sidebar_position: 0
custom_edit_url: null
---

[auto.fun - v1.0.0](../) / worker/points/helpers

## Functions

### distributeWeeklyPoints

▸ **distributeWeeklyPoints**(`env`, `weeklyPool?`, `capPercent?`): `Promise`\<\{ `distributed`: `number` ; `unassigned`: `number`  }\>

Malibu To do: add this to a cron job to run once a week

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `env` | [`Env`](../interfaces/worker_env.Env.md) | `undefined` |
| `weeklyPool` | `number` | `1_000_000` |
| `capPercent` | `number` | `0.02` |

#### Returns

`Promise`\<\{ `distributed`: `number` ; `unassigned`: `number`  }\>
