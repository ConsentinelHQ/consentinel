CREATE TABLE "jira_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"base_url" text NOT NULL,
	"email" text NOT NULL,
	"api_token_enc" text NOT NULL,
	"project_key" text NOT NULL,
	"issue_type_id" text NOT NULL,
	"issue_type_name" text NOT NULL,
	"auto_create" boolean DEFAULT true NOT NULL,
	"hook_token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jira_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"issue_key" text NOT NULL,
	"scan_id" uuid,
	"fingerprints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "jira_issue_key" text;--> statement-breakpoint
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jira_connections_org_idx" ON "jira_connections" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_connections_hook_token_idx" ON "jira_connections" USING btree ("hook_token");--> statement-breakpoint
CREATE UNIQUE INDEX "jira_issues_org_key_idx" ON "jira_issues" USING btree ("org_id","issue_key");