ALTER TABLE "orgs" ADD COLUMN "stripe_subscription_item_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_status" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "current_period_end" timestamp with time zone;