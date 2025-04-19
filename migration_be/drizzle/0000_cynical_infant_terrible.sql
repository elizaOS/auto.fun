CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cache_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`symbol` text NOT NULL,
	`price` text NOT NULL,
	`timestamp` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fees` (
	`id` text PRIMARY KEY NOT NULL,
	`token_mint` text NOT NULL,
	`user` text,
	`direction` integer,
	`fee_amount` text,
	`token_amount` text,
	`sol_amount` text,
	`type` text NOT NULL,
	`tx_id` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`mint` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`media_url` text NOT NULL,
	`negative_prompt` text,
	`num_inference_steps` integer,
	`seed` integer,
	`num_frames` integer,
	`fps` integer,
	`motion_bucket_id` integer,
	`duration` integer,
	`duration_seconds` integer,
	`bpm` integer,
	`creator` text,
	`timestamp` text NOT NULL,
	`daily_generation_count` integer,
	`last_generation_reset` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`token_mint` text NOT NULL,
	`message` text NOT NULL,
	`parent_id` text,
	`reply_count` integer,
	`timestamp` text NOT NULL,
	`tier` text
);
--> statement-breakpoint
CREATE TABLE `oauth_verifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pre_generated_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`image` text,
	`created_at` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`token_mint` text NOT NULL,
	`user` text NOT NULL,
	`type` text NOT NULL,
	`direction` integer NOT NULL,
	`amount_in` real,
	`amount_out` real,
	`price_impact` real,
	`price` real NOT NULL,
	`tx_id` text NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swaps_tx_id_unique` ON `swaps` (`tx_id`);--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE `token_holders` (
	`id` text PRIMARY KEY NOT NULL,
	`mint` text NOT NULL,
	`address` text NOT NULL,
	`amount` real NOT NULL,
	`percentage` real NOT NULL,
	`last_updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticker` text NOT NULL,
	`url` text NOT NULL,
	`image` text NOT NULL,
	`twitter` text,
	`telegram` text,
	`website` text,
	`discord` text,
	`farcaster` text,
	`description` text,
	`mint` text NOT NULL,
	`creator` text NOT NULL,
	`nft_minted` text,
	`lock_id` text,
	`locked_amount` text,
	`locked_at` text,
	`harvested_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`last_updated` text NOT NULL,
	`completed_at` text,
	`withdrawn_at` text,
	`migrated_at` text,
	`market_id` text,
	`base_vault` text,
	`quote_vault` text,
	`withdrawn_amount` real,
	`reserve_amount` real,
	`reserve_lamport` real,
	`virtual_reserves` real,
	`liquidity` real,
	`current_price` real,
	`market_cap_usd` real,
	`token_price_usd` real,
	`sol_price_usd` real,
	`curve_progress` real,
	`curve_limit` real,
	`price_change_24h` real,
	`price_24h_ago` real,
	`volume_24h` real,
	`inference_count` integer,
	`last_volume_reset` text,
	`last_price_update` text,
	`holder_count` integer,
	`tx_id` text,
	`migration` text,
	`withdrawn_amounts` text,
	`pool_info` text,
	`lock_lp_tx_id` text,
	`imported` integer DEFAULT 0,
	`featured` integer DEFAULT 0,
	`verified` integer DEFAULT 0,
	`hidden` integer DEFAULT 0,
	`token_supply` text DEFAULT '1000000000000000',
	`token_supply_ui_amount` integer DEFAULT 1000000000,
	`token_decimals` integer DEFAULT 6,
	`last_supply_update` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_mint_unique` ON `tokens` (`mint`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`address` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`reward_points` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_address_unique` ON `users` (`address`);--> statement-breakpoint