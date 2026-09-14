CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "sites_user_url_idx";--> statement-breakpoint
DROP INDEX "sites_user_idx";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "schedule" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "last_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_unique_idx" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_clerk_org_id_idx" ON "orgs" USING btree ("clerk_org_id");--> statement-breakpoint
CREATE INDEX "orgs_stripe_customer_idx" ON "orgs" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_url_idx" ON "sites" USING btree ("org_id","url");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sites_schedule_idx" ON "sites" USING btree ("schedule","last_scheduled_at");--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "user_id";