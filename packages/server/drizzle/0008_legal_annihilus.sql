CREATE INDEX "tokens_market_cap_usd_idx" ON "tokens" USING btree ("market_cap_usd");--> statement-breakpoint
CREATE INDEX "tokens_volume_24h_idx" ON "tokens" USING btree ("volume_24h");--> statement-breakpoint
CREATE INDEX "tokens_holder_count_idx" ON "tokens" USING btree ("holder_count");--> statement-breakpoint
CREATE INDEX "tokens_curve_progress_idx" ON "tokens" USING btree ("curve_progress");--> statement-breakpoint
CREATE INDEX "tokens_name_idx" ON "tokens" USING btree ("name");