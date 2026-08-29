-- Conversation turns for an AI draft (validated output JSON only).

ALTER TABLE "ai_drafts" ADD COLUMN "messages" JSONB;
