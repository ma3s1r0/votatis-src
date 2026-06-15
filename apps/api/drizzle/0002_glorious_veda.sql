CREATE TABLE IF NOT EXISTS "intake_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ALTER COLUMN "sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "expected_sha256" text;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;