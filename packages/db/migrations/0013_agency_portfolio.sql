ALTER TABLE "orgs" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "brand_logo_url" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "brand_website" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "client" text;--> statement-breakpoint
CREATE INDEX "sites_org_client_idx" ON "sites" USING btree ("org_id","client");