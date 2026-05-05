ALTER TABLE "chat_messages" ADD COLUMN "parent_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "judge_verdict" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "judge_scores" jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "judge_issues" text[];--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_parent_message_id_chat_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_parent_idx" ON "chat_messages" USING btree ("parent_message_id");