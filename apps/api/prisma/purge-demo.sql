-- ---------------------------------------------------------------------------
-- purge-demo.sql — remove the seeded demo / sample data from a Syncourse database
-- ---------------------------------------------------------------------------
-- Everything runs inside ONE transaction.  Without -v commit=1 that transaction
-- is rolled back at the end, so the default run is a dry run that still prints
-- exactly what would go and proves the deletes execute in a valid order.
--
--   dry run :  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/purge-demo.sql
--   for real :  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v commit=1 -f prisma/purge-demo.sql
--
-- Options (every default is the conservative choice):
--   -v mode=catalogue       delete every course / lecturer / organisation /
--                           learning path, not only the rows fingerprinted as
--                           demo data.  Use this to get an empty catalogue to
--                           type real data into.
--   -v keep_taxonomy=0      also delete the 8 categories and 4 levels — but only
--                           rows no surviving course still points at.
--   -v keep_legal=0         also delete the seeded terms / privacy / refund docs.
--   -v keep_app_versions=0  also delete the seeded AppVersion changelog rows.
--   -v keep_trending=1      keep the 8 seeded TrendingQuery rows (default: delete).
--   -v force_paid_demo=1    delete demo accounts even when they carry a Subscription.
--
-- Never touched: accounts whose email is not @syncourse.app, any account with
-- isStaff = true (that is how you sign in to /admin), and every Subscription and
-- PaymentReference belonging to an account that survives.
--
-- Why SQL and not prisma/seed.ts: that script wipes 30 tables and rebuilds the
-- demo world.  Running it here would delete your real rows and put the fake ones
-- back.  It refuses under NODE_ENV=production for exactly that reason.
-- ---------------------------------------------------------------------------

\pset pager off

\if :{?commit}
\else
  \set commit 0
\endif
\if :{?mode}
\else
  \set mode seed
\endif
\if :{?keep_taxonomy}
\else
  \set keep_taxonomy 1
\endif
\if :{?keep_legal}
\else
  \set keep_legal 1
\endif
\if :{?keep_app_versions}
\else
  \set keep_app_versions 1
\endif
\if :{?keep_trending}
\else
  \set keep_trending 0
\endif
\if :{?force_paid_demo}
\else
  \set force_paid_demo 0
\endif

BEGIN;

CREATE TEMP TABLE opt AS
SELECT :'mode'::text                    AS mode,
       :keep_taxonomy::int::boolean     AS keep_taxonomy,
       :keep_legal::int::boolean        AS keep_legal,
       :keep_app_versions::int::boolean AS keep_app_versions,
       :keep_trending::int::boolean     AS keep_trending,
       :force_paid_demo::int::boolean   AS force_paid_demo;

CREATE TEMP TABLE purge_log (step text, rows bigint);

-- ---------------------------------------------------------------------------
-- 1. Fingerprints: what the seed scripts create
-- ---------------------------------------------------------------------------
-- Course slugs from prisma/seed.ts (8) and prisma/seed-rich.ts (12), plus the
-- rows the bundled prisma/sample-feeds/*.txt imports produce.
CREATE TEMP TABLE seed_course (slug text PRIMARY KEY);
INSERT INTO seed_course VALUES
  ('ai-introduction-to-ai-automation-with-n8n-langchain-no-code'),
  ('the-complete-web-developer-bootcamp'),
  ('machine-learning-for-beginners-pytorch-edition'),
  ('react-the-complete-guide-incl-hooks-next-js'),
  ('ai-ml-engineer-roadmap-15-step-cheat-sheet'),
  ('top-ai-algorithms-their-use-cases-cheat-sheet'),
  ('docker-kubernetes-the-practical-guide'),
  ('flutter-dart-the-complete-guide'),
  ('ui-ux-design-fundamentals-from-wireframes-to-prototypes'),
  ('business-english-for-developers-freelancers'),
  ('data-structures-algorithms-in-python'),
  ('android-development-with-kotlin-build-5-apps'),
  ('sql-for-data-analysis-from-queries-to-dashboards'),
  ('product-management-essentials-ship-what-matters'),
  ('devops-bootcamp-ci-cd-terraform-monitoring'),
  ('python-for-everybody-zero-to-automation'),
  ('design-systems-component-libraries'),
  ('machine-learning-with-scikit-learn-the-practical-path'),
  ('the-ux-research-field-notes-cheat-sheet'),
  ('typescript-for-real-projects'),
  ('complete-machine-learning-and-data-science-2021'),
  ('complete-machine-learning-and-data-science-zero-to-mastery');

-- Lecturers and organisations invented by the seeds or by the sample feed parser.
CREATE TEMP TABLE seed_lecturer (slug text PRIMARY KEY);
INSERT INTO seed_lecturer VALUES
  ('derek-cheung'), ('andrei-neagoie'), ('daniel-bourke'),
  ('max-schwarzm-ller'), ('adrian-twarog'), ('kirill-eremenko'),
  ('han-chung-lee'), ('rashim-mogha'), ('unknown');

CREATE TEMP TABLE seed_org (slug text PRIMARY KEY);
INSERT INTO seed_org VALUES ('devpack'), ('zero-to-mastery'), ('academind'), ('ztm');

CREATE TEMP TABLE seed_path (title text PRIMARY KEY);
INSERT INTO seed_path VALUES ('Full-Stack Web Path'), ('AI & ML Starter Path');

CREATE TEMP TABLE seed_query (query text PRIMARY KEY);
INSERT INTO seed_query VALUES
  ('react'), ('n8n'), ('machine learning'), ('flutter'),
  ('docker'), ('langchain'), ('python'), ('full stack');

-- ---------------------------------------------------------------------------
-- 2. Classify: which courses and which accounts are demo data
-- ---------------------------------------------------------------------------
-- Soft-deleted courses are included on purpose: DELETE /admin/courses/:slug only
-- stamps deletedAt, so the row (and its lessons, reviews and progress) is still
-- there and still pins the lecturer and organisation it points at.
CREATE TEMP TABLE purge_course AS
SELECT c.id,
       c.slug,
       c.title,
       c."deletedAt" IS NOT NULL AS was_soft_deleted,
       CASE
         WHEN s.slug IS NOT NULL THEN 'seed script slug'
         WHEN c."thumbnailUrl" LIKE '%picsum.photos%'
           OR c."bannerUrl" LIKE '%picsum.photos%'
           OR c."thumbnailUrl" LIKE '%images.unsplash.com%'
           OR c."bannerUrl" LIKE '%images.unsplash.com%' THEN 'placeholder image'
         WHEN EXISTS (SELECT 1 FROM "Lesson" l
                       WHERE l."courseId" = c.id
                         AND l."videoUrl" LIKE '%commondatastorage.googleapis.com%') THEN 'sample video'
         ELSE 'mode=catalogue'
       END AS matched_by
FROM "Course" c
LEFT JOIN seed_course s ON s.slug = c.slug
WHERE (SELECT mode FROM opt) = 'catalogue'
   OR s.slug IS NOT NULL
   OR c."thumbnailUrl" LIKE '%picsum.photos%'
   OR c."bannerUrl" LIKE '%picsum.photos%'
   OR c."thumbnailUrl" LIKE '%images.unsplash.com%'
   OR c."bannerUrl" LIKE '%images.unsplash.com%'
   OR EXISTS (SELECT 1 FROM "Lesson" l
               WHERE l."courseId" = c.id
                 AND l."videoUrl" LIKE '%commondatastorage.googleapis.com%');

-- Every account the seeds create uses an @syncourse.app address: demo@, selam@,
-- the four reviewer personas and learner_0…learner_23.  isStaff accounts are
-- excluded even when they match, because that is the /admin login.
CREATE TEMP TABLE purge_user AS
SELECT u.id,
       u.email,
       u."telegramId",
       (SELECT count(*) FROM "Subscription" s WHERE s."userId" = u.id) AS subs
FROM "User" u
WHERE u.email LIKE '%@syncourse.app'
  AND u."isStaff" = false;

-- A demo address that carries payment history is held back: it may be a real
-- test purchase whose record you still want.  Override with -v force_paid_demo=1.
CREATE TEMP TABLE kept_user AS
SELECT * FROM purge_user
WHERE subs > 0 AND NOT (SELECT force_paid_demo FROM opt);
DELETE FROM purge_user WHERE id IN (SELECT id FROM kept_user);

-- ---------------------------------------------------------------------------
-- 3. Report: what goes, what stays
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== courses to delete ==='
SELECT slug, matched_by, was_soft_deleted AS soft_deleted,
       (SELECT count(*) FROM "Lesson"        l WHERE l."courseId" = p.id) AS lessons,
       (SELECT count(*) FROM "DownloadEvent" d WHERE d."courseId" = p.id) AS downloads,
       (SELECT count(*) FROM "Review"        r WHERE r."courseId" = p.id) AS reviews
FROM purge_course p
ORDER BY matched_by, slug;

\echo ''
\echo '=== courses that stay (check this list before committing) ==='
SELECT c.slug,
       c."deletedAt" IS NOT NULL AS soft_deleted,
       c."createdAt"::date       AS created,
       coalesce(l.name, '—')     AS lecturer,
       coalesce(o.name, '—')     AS organisation,
       (SELECT count(*) FROM "Lesson" x WHERE x."courseId" = c.id) AS lessons,
       coalesce(c."sourceUrl", '—') AS source
FROM "Course" c
LEFT JOIN "Lecturer"     l ON l.id = c."lecturerId"
LEFT JOIN "Organization" o ON o.id = c."organizationId"
WHERE c.id NOT IN (SELECT id FROM purge_course)
ORDER BY c."createdAt";

\echo ''
\echo '=== accounts to delete ==='
SELECT email,
       (SELECT count(*) FROM "DownloadEvent" d WHERE d."userId" = u.id) AS downloads,
       (SELECT count(*) FROM "Review"        r WHERE r."userId" = u.id) AS reviews,
       (SELECT count(*) FROM "Session"       s WHERE s."userId" = u.id) AS sessions
FROM purge_user u
ORDER BY email;

\echo ''
\echo '=== accounts that stay ==='
SELECT u.email,
       u."isStaff"        AS staff,
       u."isVerified"     AS verified,
       u."createdAt"::date AS created,
       (SELECT count(*) FROM "Subscription"  s WHERE s."userId" = u.id) AS subscriptions,
       (SELECT count(*) FROM "DownloadEvent" d WHERE d."userId" = u.id) AS downloads
FROM "User" u
WHERE u.id NOT IN (SELECT id FROM purge_user)
ORDER BY u."isStaff" DESC, u."createdAt";

\echo ''
\echo '=== lecturers, organisations and paths to delete ==='
SELECT 'lecturer' AS kind, l.name AS name
FROM "Lecturer" l
WHERE (l.slug IN (SELECT slug FROM seed_lecturer) OR (SELECT mode FROM opt) = 'catalogue')
  AND NOT EXISTS (SELECT 1 FROM "Course" c
                   WHERE c."lecturerId" = l.id AND c.id NOT IN (SELECT id FROM purge_course))
UNION ALL
SELECT 'organisation', o.name
FROM "Organization" o
WHERE (o.slug IN (SELECT slug FROM seed_org) OR (SELECT mode FROM opt) = 'catalogue')
  AND NOT EXISTS (SELECT 1 FROM "Course" c
                   WHERE c."organizationId" = o.id AND c.id NOT IN (SELECT id FROM purge_course))
UNION ALL
SELECT 'learning path', p.title
FROM "LearningPath" p
WHERE p.title IN (SELECT title FROM seed_path) OR (SELECT mode FROM opt) = 'catalogue'
ORDER BY 1, 2;

-- If this prints 0 you cannot reach /admin afterwards, so stop and promote an
-- account first: UPDATE "User" SET "isStaff" = true WHERE email = 'you@example.com';
\echo ''
\echo '=== staff accounts remaining (must be at least 1) ==='
SELECT count(*) AS staff_accounts FROM "User" WHERE "isStaff" = true;

-- ---------------------------------------------------------------------------
-- 4. Count the rows the database will cascade away on its own
-- ---------------------------------------------------------------------------
-- Prisma declares onDelete: Cascade on every child of Course and of User, so the
-- two DELETEs below carry all of this with them.  Counting first is the only way
-- to report it — a cascaded delete returns nothing.
INSERT INTO purge_log (step, rows)
SELECT 'Section (cascade)',        count(*) FROM "Section"     WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'Lesson (cascade)',         count(*) FROM "Lesson"      WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'LessonFile (cascade)',     count(*) FROM "LessonFile"  WHERE "lessonId" IN (SELECT id FROM "Lesson" WHERE "courseId" IN (SELECT id FROM purge_course))
UNION ALL SELECT 'Note (cascade)',           count(*) FROM "Note"        WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'Attachment (cascade)',     count(*) FROM "Attachment"  WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'Review (cascade)',         count(*) FROM "Review"      WHERE "courseId" IN (SELECT id FROM purge_course) OR "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'Rating (cascade)',         count(*) FROM "Rating"      WHERE "courseId" IN (SELECT id FROM purge_course) OR "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'SavedCourse (cascade)',    count(*) FROM "SavedCourse" WHERE "courseId" IN (SELECT id FROM purge_course) OR "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'LikedCourse (cascade)',    count(*) FROM "LikedCourse" WHERE "courseId" IN (SELECT id FROM purge_course) OR "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'DownloadEvent (cascade)',  count(*) FROM "DownloadEvent" WHERE "courseId" IN (SELECT id FROM purge_course) OR "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'CollectionItem (cascade)', count(*) FROM "CollectionItem" WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'CourseCategory (cascade)', count(*) FROM "CourseCategory" WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'CourseTag (cascade)',      count(*) FROM "CourseTag"      WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'CourseAudience (cascade)', count(*) FROM "CourseAudience" WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'LearningPathCourse (cascade)', count(*) FROM "LearningPathCourse" WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'TelegramCourseLink (cascade)', count(*) FROM "TelegramCourseLink" WHERE "courseId" IN (SELECT id FROM purge_course)
UNION ALL SELECT 'Session (cascade)',        count(*) FROM "Session"        WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'Notification (cascade)',   count(*) FROM "Notification"   WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'TasteProfile (cascade)',   count(*) FROM "TasteProfile"   WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'CollectionList (cascade)', count(*) FROM "CollectionList" WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'SavedList (cascade)',      count(*) FROM "SavedList"      WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'Circle (cascade)',         count(*) FROM "Circle"         WHERE "ownerId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'CircleMember (cascade)',   count(*) FROM "CircleMember"   WHERE "userId" IN (SELECT id FROM purge_user)
UNION ALL SELECT 'Subscription (cascade)',   count(*) FROM "Subscription"   WHERE "userId" IN (SELECT id FROM purge_user);

-- ---------------------------------------------------------------------------
-- 5. Delete
-- ---------------------------------------------------------------------------
WITH d AS (DELETE FROM "Course" WHERE id IN (SELECT id FROM purge_course) RETURNING 1)
INSERT INTO purge_log SELECT 'Course', count(*) FROM d;

WITH d AS (DELETE FROM "User" WHERE id IN (SELECT id FROM purge_user) RETURNING 1)
INSERT INTO purge_log SELECT 'User', count(*) FROM d;

-- Bot state is keyed on the Telegram id, not on User.id, so no FK carries it away.
WITH tg AS (SELECT "telegramId" AS id FROM purge_user WHERE "telegramId" IS NOT NULL),
     a AS (DELETE FROM "TelegramWizard"  WHERE "userId" IN (SELECT id FROM tg) RETURNING 1),
     b AS (DELETE FROM "TelegramNav"     WHERE "userId" IN (SELECT id FROM tg) RETURNING 1),
     c AS (DELETE FROM "TelegramUserFile" WHERE "userId" IN (SELECT id FROM tg) RETURNING 1),
     e AS (DELETE FROM "TelegramActivity" WHERE "userId" IN (SELECT id FROM tg) RETURNING 1)
INSERT INTO purge_log
SELECT 'Telegram bot state', (SELECT count(*) FROM a) + (SELECT count(*) FROM b)
                           + (SELECT count(*) FROM c) + (SELECT count(*) FROM e);

-- Lecturers and organisations go only once nothing points at them any more, so a
-- course you keep never loses its publisher.  Course → Lecturer and
-- Course → Organization are the two FKs in this schema without a cascade rule:
-- deleting either while a course still referenced it would abort the transaction.
WITH d AS (
  DELETE FROM "Lecturer" l
  WHERE (l.slug IN (SELECT slug FROM seed_lecturer) OR (SELECT mode FROM opt) = 'catalogue')
    AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."lecturerId" = l.id)
  RETURNING 1)
INSERT INTO purge_log SELECT 'Lecturer', count(*) FROM d;

WITH d AS (
  DELETE FROM "Organization" o
  WHERE (o.slug IN (SELECT slug FROM seed_org) OR (SELECT mode FROM opt) = 'catalogue')
    AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."organizationId" = o.id)
  RETURNING 1)
INSERT INTO purge_log SELECT 'Organization', count(*) FROM d;

WITH d AS (
  DELETE FROM "LearningPath" p
  WHERE (p.title IN (SELECT title FROM seed_path) OR (SELECT mode FROM opt) = 'catalogue')
  RETURNING 1)
INSERT INTO purge_log SELECT 'LearningPath', count(*) FROM d;

WITH d AS (
  DELETE FROM "TrendingQuery"
  WHERE NOT (SELECT keep_trending FROM opt)
    AND query IN (SELECT query FROM seed_query)
  RETURNING 1)
INSERT INTO purge_log SELECT 'TrendingQuery', count(*) FROM d;

-- The 8 categories and 4 levels are plain taxonomy, not fake content, and the
-- admin course form has nothing to offer without them — so by default the rows
-- stay and only their picsum.photos placeholder covers are cleared.
WITH d AS (
  UPDATE "Category" SET "coverImage" = NULL
  WHERE "coverImage" LIKE '%picsum.photos%' OR "coverImage" LIKE '%images.unsplash.com%'
  RETURNING 1)
INSERT INTO purge_log SELECT 'Category cover cleared', count(*) FROM d;

WITH d AS (
  DELETE FROM "Category" c
  WHERE NOT (SELECT keep_taxonomy FROM opt)
    AND NOT EXISTS (SELECT 1 FROM "CourseCategory" cc WHERE cc."categoryId" = c.id)
    AND NOT EXISTS (SELECT 1 FROM "TasteProfile" t WHERE t."categoryId" = c.id)
  RETURNING 1)
INSERT INTO purge_log SELECT 'Category', count(*) FROM d;

WITH d AS (
  DELETE FROM "Level" l
  WHERE NOT (SELECT keep_taxonomy FROM opt)
    AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."levelId" = l.id)
  RETURNING 1)
INSERT INTO purge_log SELECT 'Level', count(*) FROM d;

-- Kept by default: the terms / privacy / refund text is real policy copy that the
-- web build statically renders, and the AppVersion rows gate the in-app update
-- banner.  Neither is demo catalogue data.
WITH d AS (
  DELETE FROM "LegalDocument" WHERE NOT (SELECT keep_legal FROM opt) RETURNING 1)
INSERT INTO purge_log SELECT 'LegalDocument', count(*) FROM d;

WITH d AS (
  DELETE FROM "AppVersion" WHERE NOT (SELECT keep_app_versions FROM opt) RETURNING 1)
INSERT INTO purge_log SELECT 'AppVersion', count(*) FROM d;

-- ---------------------------------------------------------------------------
-- 6. Summary
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== rows removed ==='
SELECT step, rows FROM purge_log WHERE rows > 0 ORDER BY rows DESC, step;

\echo ''
\echo '=== held back (demo address with payment history) ==='
SELECT email, subs AS subscriptions FROM kept_user ORDER BY email;

\echo ''
\echo '=== what is left ==='
SELECT 'Course' AS table_name, count(*) FROM "Course"
UNION ALL SELECT 'User',          count(*) FROM "User"
UNION ALL SELECT 'Lecturer',      count(*) FROM "Lecturer"
UNION ALL SELECT 'Organization',  count(*) FROM "Organization"
UNION ALL SELECT 'Category',      count(*) FROM "Category"
UNION ALL SELECT 'Level',         count(*) FROM "Level"
UNION ALL SELECT 'LearningPath',  count(*) FROM "LearningPath"
UNION ALL SELECT 'Review',        count(*) FROM "Review"
UNION ALL SELECT 'DownloadEvent', count(*) FROM "DownloadEvent"
UNION ALL SELECT 'Subscription',  count(*) FROM "Subscription"
UNION ALL SELECT 'LegalDocument', count(*) FROM "LegalDocument"
UNION ALL SELECT 'AppVersion',    count(*) FROM "AppVersion"
ORDER BY table_name;

\if :commit
  COMMIT;
  \echo ''
  \echo '*** COMMITTED — the rows above are gone. ***'
\else
  ROLLBACK;
  \echo ''
  \echo '*** DRY RUN — rolled back, nothing was changed. Re-run with -v commit=1 to apply. ***'
\endif






