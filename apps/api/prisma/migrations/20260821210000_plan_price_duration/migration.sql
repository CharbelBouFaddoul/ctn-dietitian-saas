-- Plan marketing price + duration for subscription periods
ALTER TABLE "plans" ADD COLUMN "price_cents" INTEGER;
ALTER TABLE "plans" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "plans" ADD COLUMN "show_price" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "plans" ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 30;
