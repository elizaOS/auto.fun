CREATE INDEX "tokens_ticker_idx" ON "tokens" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "tokens_creator_idx" ON "tokens" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "tokens_status_idx" ON "tokens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tokens_market_idx" ON "tokens" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "tokens_mint_idx" ON "tokens" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "tokens_lock_id_idx" ON "tokens" USING btree ("lock_id");--> statement-breakpoint
CREATE INDEX "tokens_hidden_idx" ON "tokens" USING btree ("hidden");--> statement-breakpoint
CREATE INDEX "tokens_imported_idx" ON "tokens" USING btree ("imported");--> statement-breakpoint
CREATE INDEX "tokens_featured_idx" ON "tokens" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "tokens_verified_idx" ON "tokens" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "tokens_hide_from_featured_idx" ON "tokens" USING btree ("hide_from_featured");