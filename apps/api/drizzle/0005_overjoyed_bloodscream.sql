ALTER TABLE "report" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "election_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report" ADD CONSTRAINT "report_election_id_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."election"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
