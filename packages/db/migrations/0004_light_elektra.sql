ALTER TABLE "scans" ADD COLUMN "share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "scans_share_token_idx" ON "scans" USING btree ("share_token");