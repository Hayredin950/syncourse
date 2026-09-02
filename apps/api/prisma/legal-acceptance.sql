-- Syncourse — schema change for admin-editable legal documents
-- ---------------------------------------------------------------------------
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/legal-acceptance.sql
--
-- Adds the columns and table behind /admin/legal: LegalDocument gains a title,
-- a change summary, a requiresAcceptance flag and edit tracking, and a new
-- LegalAcceptance table records who agreed to which version.
--
-- Additive only. Nothing is dropped, no existing column is retyped, and every
-- statement is guarded — running it twice is a no-op. Deliberately hand-written
-- rather than `prisma db push`, because push reconciles *all* drift and would
-- happily drop anything in the live database that the schema no longer mentions.
--
-- Names and types match what Prisma itself would emit (timestamp(3),
-- "<Table>_<col>_fkey", "…_key" for @@unique, "…_idx" for @@index), so a later
-- `prisma db push` sees no drift from this table.

BEGIN;

ALTER TABLE "LegalDocument"
  ADD COLUMN IF NOT EXISTS "title"              text,
  ADD COLUMN IF NOT EXISTS "changeSummary"      text,
  ADD COLUMN IF NOT EXISTS "requiresAcceptance" boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedById"        text;

-- The refund policy is informational: publishing a correction to it should not
-- put a consent prompt in front of every user. Terms and privacy do require it.
UPDATE "LegalDocument" SET "requiresAcceptance" = false
 WHERE "type" = 'refund' AND "requiresAcceptance" = true;

DO $$ BEGIN
  ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LegalAcceptance" (
  "id"         text         NOT NULL,
  "userId"     text         NOT NULL,
  "documentId" text         NOT NULL,
  "type"       text         NOT NULL,
  "version"    text         NOT NULL,
  "acceptedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source"     text         NOT NULL DEFAULT 'web',
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- One acceptance per user per version: re-submitting the same consent is a
-- no-op rather than a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS "LegalAcceptance_userId_documentId_version_key"
  ON "LegalAcceptance" ("userId", "documentId", "version");
CREATE INDEX IF NOT EXISTS "LegalAcceptance_documentId_version_idx"
  ON "LegalAcceptance" ("documentId", "version");

DO $$ BEGIN
  ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

\echo ''
\echo '=== legal documents ==='
SELECT "type", "version", "requiresAcceptance" AS needs_accept,
       length("bodyMd") AS body_chars, "effectiveAt"::date AS effective
  FROM "LegalDocument" ORDER BY "type";

\echo ''
\echo '=== acceptances recorded ==='
SELECT count(*) AS rows FROM "LegalAcceptance";

\echo ''
\echo 'Done. Additive only — safe to re-run.'
