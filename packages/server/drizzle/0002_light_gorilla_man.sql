CREATE TABLE "metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_likes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personalities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "swaps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vanity_generation_instances" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vanity_keypairs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "message_likes" CASCADE;--> statement-breakpoint
DROP TABLE "personalities" CASCADE;--> statement-breakpoint
DROP TABLE "swaps" CASCADE;--> statement-breakpoint
DROP TABLE "vanity_generation_instances" CASCADE;--> statement-breakpoint
DROP TABLE "vanity_keypairs" CASCADE;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fees" ADD COLUMN "expires_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tier" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_picture_url" text;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_unique" UNIQUE("user_id");