-- Advanced invoices: tax + discount + default tax setting

CREATE TYPE "InvoiceDiscountType" AS ENUM ('PERCENT', 'FIXED');

ALTER TABLE "invoices"
  ADD COLUMN "discount_type" "InvoiceDiscountType",
  ADD COLUMN "discount_value" DECIMAL(12,4),
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax_rate_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "dietitian_settings"
  ADD COLUMN "invoice_default_tax_percent" DECIMAL(8,4) NOT NULL DEFAULT 0;
