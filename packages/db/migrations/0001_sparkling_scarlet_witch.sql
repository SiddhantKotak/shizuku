ALTER TABLE "password_reset_tokens" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;