-- Assistant daily budget (Phase 5).
--
-- Additive only: the live database has drift, so migrations are applied as
-- plain SQL instead of `prisma db push`. Safe to run more than once.
--
--   psql "$DATABASE_URL" -f apps/api/prisma/sql/2026-11-assistant.sql

CREATE TABLE IF NOT EXISTS "AssistantUsage" (
  "day"       TEXT        NOT NULL,
  "subject"   TEXT        NOT NULL,
  "count"     INTEGER     NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("day", "subject")
);
