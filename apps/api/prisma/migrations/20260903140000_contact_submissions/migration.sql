-- Public contact form submissions for the admin inbox
CREATE TYPE "ContactSubmissionStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

CREATE TABLE "contact_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "plan_slug" TEXT,
    "plan_name" TEXT,
    "status" "ContactSubmissionStatus" NOT NULL DEFAULT 'NEW',
    "read_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_submissions_status_created_at_idx" ON "contact_submissions"("status", "created_at");
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions"("created_at");
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions"("email");
