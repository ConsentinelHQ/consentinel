CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"text" text NOT NULL,
	"sha256" text NOT NULL,
	"chars" integer NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_scan_id" uuid,
	"last_scan_id" uuid
);
--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_first_scan_id_scans_id_fk" FOREIGN KEY ("first_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_last_scan_id_scans_id_fk" FOREIGN KEY ("last_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_versions_site_idx" ON "policy_versions" USING btree ("site_id","kind","first_seen_at");