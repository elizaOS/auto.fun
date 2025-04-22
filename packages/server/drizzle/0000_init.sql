CREATE TABLE "access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"symbol" text NOT NULL,
	"price" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fees" (
	"id" text PRIMARY KEY NOT NULL,
	"token_mint" text NOT NULL,
	"user" text,
	"direction" integer,
	"fee_amount" text,
	"token_amount" text,
	"sol_amount" text,
	"type" text NOT NULL,
	"tx_id" text,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"media_url" text NOT NULL,
	"negative_prompt" text,
	"num_inference_steps" integer,
	"seed" integer,
	"num_frames" integer,
	"fps" integer,
	"motion_bucket_id" integer,
	"duration" integer,
	"duration_seconds" integer,
	"bpm" integer,
	"creator" text,
	"timestamp" timestamp NOT NULL,
	"daily_generation_count" integer,
	"last_generation_reset" timestamp
);
--> statement-breakpoint
CREATE TABLE "message_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_address" text NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"author" text NOT NULL,
	"token_mint" text NOT NULL,
	"message" text NOT NULL,
	"parent_id" text,
	"reply_count" integer,
	"likes" integer DEFAULT 0 NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_verifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "oauth_verifiers_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "personalities" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pre_generated_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"token_mint" text NOT NULL,
	"owner_address" text NOT NULL,
	"twitter_user_id" text NOT NULL,
	"twitter_user_name" text NOT NULL,
	"twitter_image_url" text NOT NULL,
	"official" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"url" text NOT NULL,
	"image" text NOT NULL,
	"twitter" text,
	"telegram" text,
	"website" text,
	"discord" text,
	"farcaster" text,
	"description" text,
	"mint" text NOT NULL,
	"creator" text NOT NULL,
	"nft_minted" text,
	"lock_id" text,
	"locked_amount" text,
	"locked_at" timestamp,
	"harvested_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_updated" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"withdrawn_at" timestamp,
	"migrated_at" timestamp,
	"market_id" text,
	"base_vault" text,
	"quote_vault" text,
	"withdrawn_amount" real,
	"reserve_amount" real,
	"reserve_lamport" real,
	"virtual_reserves" real,
	"liquidity" real,
	"current_price" real,
	"market_cap_usd" real,
	"token_price_usd" real,
	"sol_price_usd" real,
	"curve_progress" real,
	"curve_limit" real,
	"price_change_24h" real,
	"price_24h_ago" real,
	"volume_24h" real,
	"inference_count" integer,
	"last_volume_reset" timestamp,
	"last_price_update" timestamp,
	"holder_count" integer,
	"tx_id" text,
	"migration" text,
	"withdrawn_amounts" text,
	"pool_info" text,
	"lock_lp_tx_id" text,
	"imported" integer DEFAULT 0,
	"featured" integer DEFAULT 0,
	"verified" integer DEFAULT 0,
	"hidden" integer DEFAULT 0,
	"token_supply" text DEFAULT '1000000000000000',
	"token_supply_ui_amount" integer DEFAULT 1000000000,
	"token_decimals" integer DEFAULT 6,
	"last_supply_update" timestamp,
	CONSTRAINT "tokens_mint_unique" UNIQUE("mint")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"address" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"reward_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"suspended" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "vanity_generation_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text,
	"ip_address" text,
	"status" text DEFAULT 'stopped' NOT NULL,
	"job_id" text,
	"last_heartbeat" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vanity_keypairs" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"secret_key" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vanity_keypairs_address_unique" UNIQUE("address")
);
