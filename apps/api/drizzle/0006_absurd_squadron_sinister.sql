ALTER TABLE "report" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_tracking_number_unique" UNIQUE("tracking_number");