-- Rating baseline for imported courses
-- ---------------------------------------------------------------------------
--   npx prisma db execute --file prisma/sql/2026-11-rating-baseline.sql \
--                         --schema prisma/schema.prisma
--
-- A Telegram post carries the source rating (4.5 from 1,646 votes). The first
-- learner who tapped a star used to replace that with a single 5, because
-- `Rating` only knew about local votes. The imported numbers are now kept in
-- `baseRatingAvg` / `baseRatingCount` and every local rating is appended:
--
--   ratingCount = baseRatingCount + localCount
--   ratingAvg   = (baseRatingAvg * baseRatingCount + localStars) / ratingCount
--
-- Additive only; no column is dropped or retyped, and re-running is a no-op.
-- Existing courses that have no local ratings yet copy their imported numbers
-- into the baseline. Courses that already have local ratings keep base 0: their
-- original imported value was overwritten before this migration and is no
-- longer recoverable, so they start from an honest local average.

BEGIN;

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "baseRatingAvg"   double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "baseRatingCount" integer          NOT NULL DEFAULT 0;

-- First run: a course with no local votes still holds only its imported
-- rating, so that is the baseline. A course that already has local votes has
-- a local-only average on the row and nothing to copy.
UPDATE "Course" c
   SET "baseRatingAvg"   = c."ratingAvg",
       "baseRatingCount" = c."ratingCount"
 WHERE c."baseRatingAvg" = 0
   AND c."baseRatingCount" = 0
   AND (c."ratingCount" > 0 OR c."ratingAvg" > 0)
   AND NOT EXISTS (SELECT 1 FROM "Rating" r WHERE r."courseId" = c.id);

-- Keep the cached columns consistent with baseline + local votes. This is a
-- no-op on a healthy row and repairs a row that was written by the old code.
WITH local AS (
  SELECT "courseId",
         COUNT(*)::int         AS cnt,
         COALESCE(SUM("stars"), 0)::double precision AS total
    FROM "Rating"
   GROUP BY "courseId"
), combined AS (
  SELECT c.id,
         c."baseRatingAvg"   AS base_avg,
         c."baseRatingCount" AS base_count,
         COALESCE(l.cnt, 0)  AS local_count,
         COALESCE(l.total, 0) AS local_total
    FROM "Course" c
    LEFT JOIN local l ON l."courseId" = c.id
)
UPDATE "Course" c
   SET "ratingCount" = combined.base_count + combined.local_count,
       "ratingAvg" = CASE
         WHEN combined.base_count + combined.local_count = 0 THEN 0
         ELSE ROUND(
           ((combined.base_avg * combined.base_count + combined.local_total)
             / (combined.base_count + combined.local_count))::numeric,
           2
         )::double precision
       END
  FROM combined
 WHERE combined.id = c.id;

COMMIT;
