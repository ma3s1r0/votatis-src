CREATE TABLE IF NOT EXISTS "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"confidence" real,
	"validity" text,
	"severity" text,
	"legal_issue" text,
	"verified" boolean DEFAULT false NOT NULL,
	"method" text NOT NULL,
	"notes" text,
	"reviewer_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "verification_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "verification_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification" ADD CONSTRAINT "verification_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification" ADD CONSTRAINT "verification_reviewer_id_admin_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admin_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_verification_id_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
