-- Toggle public Plans marketing page
ALTER TABLE "platform_settings" ADD COLUMN "plans_page_enabled" BOOLEAN NOT NULL DEFAULT true;
