ALTER TABLE "scans" ADD COLUMN "share_views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "share_first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "share_last_viewed_at" timestamp with time zone;