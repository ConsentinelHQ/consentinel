CREATE TABLE "alert_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_recipients" ADD CONSTRAINT "alert_recipients_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_recipients_org_email_idx" ON "alert_recipients" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_recipients_token_idx" ON "alert_recipients" USING btree ("unsubscribe_token");