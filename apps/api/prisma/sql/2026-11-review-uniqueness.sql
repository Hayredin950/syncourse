-- One review per reader per course, and one reply per reader per review.
--
-- ReviewsService already checks for both before inserting, but two requests
-- that arrive together can both pass the check. Postgres treats NULLs as
-- distinct in a normal unique index, so the top-level rule needs a partial
-- index. `IF NOT EXISTS` makes this file safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS "Review_user_course_root_key"
    ON "Review" ("userId", "courseId")
    WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Review_user_parent_key"
    ON "Review" ("userId", "parentId")
    WHERE "parentId" IS NOT NULL;
