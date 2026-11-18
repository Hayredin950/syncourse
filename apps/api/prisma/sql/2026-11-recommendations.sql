-- 2026-11 — recommendation + search-click learning.
--
-- Additive only. The tables and columns already exist in the live database
-- (added in `2026-11-agent-index.sql`); this adds the one index the ranking
-- query needs. Safe to run more than once.
--
-- Why the composite: ranking asks for "clicks for this exact query, grouped by
-- course" on every search. With (query, courseId) the equality lookup and the
-- grouping are served by one index; with only (query) Postgres still has to
-- read the table rows to group them.
--
-- Run against the live database:
--   psql "$DATABASE_URL" -f prisma/sql/2026-11-recommendations.sql

CREATE INDEX IF NOT EXISTS "SearchClick_query_courseId_idx"
  ON "SearchClick" ("query", "courseId");
