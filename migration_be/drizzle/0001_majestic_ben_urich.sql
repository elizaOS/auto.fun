DROP TABLE `vanity_generation_instances`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`token_mint` text NOT NULL,
	`message` text NOT NULL,
	`parent_id` text,
	`tier` text NOT NULL,
	`reply_count` integer,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "author", "token_mint", "message", "parent_id", "tier", "reply_count", "timestamp") SELECT "id", "author", "token_mint", "message", "parent_id", "tier", "reply_count", "timestamp" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tokenholders_mint_address` ON `token_holders` (`mint`,`address`);