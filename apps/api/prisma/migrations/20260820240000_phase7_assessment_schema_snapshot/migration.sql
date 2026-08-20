-- Phase 7 (product): freeze assessment template schema at start for historical responses.
ALTER TABLE "assessments" ADD COLUMN "schema_snapshot" JSONB;
