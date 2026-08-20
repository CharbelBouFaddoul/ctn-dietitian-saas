-- CreateEnum
CREATE TYPE "BrandDisplayMode" AS ENUM ('LOGO', 'TEXT', 'LOGO_AND_TEXT');

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL,
    "brand_text" TEXT NOT NULL,
    "logo_url" TEXT,
    "brand_display" "BrandDisplayMode" NOT NULL DEFAULT 'TEXT',
    "nav_items" JSONB NOT NULL,
    "cta_text" TEXT NOT NULL,
    "cta_href" TEXT NOT NULL,
    "cta_visible" BOOLEAN NOT NULL DEFAULT true,
    "dietitian_sign_in_label" TEXT NOT NULL,
    "patient_sign_in_label" TEXT NOT NULL,
    "footer_description" TEXT NOT NULL,
    "footer_groups" JSONB NOT NULL,
    "copyright_text" TEXT NOT NULL,
    "social_links" JSONB NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "contact_address" TEXT,
    "contact_hours" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
