-- Circumferences used in follow-up and body-fat formulas.
ALTER TYPE "MeasurementType" ADD VALUE 'NECK';
ALTER TYPE "MeasurementType" ADD VALUE 'CHEST';
ALTER TYPE "MeasurementType" ADD VALUE 'ABDOMEN';
ALTER TYPE "MeasurementType" ADD VALUE 'ARM';
ALTER TYPE "MeasurementType" ADD VALUE 'FOREARM';
ALTER TYPE "MeasurementType" ADD VALUE 'WRIST';
ALTER TYPE "MeasurementType" ADD VALUE 'THIGH';
ALTER TYPE "MeasurementType" ADD VALUE 'CALF';

ALTER TABLE "dietitian_settings"
  ADD COLUMN "deduce_measurements" BOOLEAN NOT NULL DEFAULT true;
