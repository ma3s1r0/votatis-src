CREATE TABLE IF NOT EXISTS "verification_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_approval_verification_reviewer_uniq" UNIQUE("verification_id","reviewer_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_approval" ADD CONSTRAINT "verification_approval_verification_id_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_approval" ADD CONSTRAINT "verification_approval_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_approval" ADD CONSTRAINT "verification_approval_reviewer_id_admin_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admin_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
