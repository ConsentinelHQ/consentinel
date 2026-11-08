ALTER TABLE "jira_connections" ADD COLUMN "api_base_url" text;--> statement-breakpoint
ALTER TABLE "jira_connections" ADD COLUMN "auth_failed_at" timestamp with time zone;