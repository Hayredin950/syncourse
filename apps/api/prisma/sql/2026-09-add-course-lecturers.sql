-- Multiple lecturers per course.
--
-- A post like "Taught By: Andrei Neagoie, Daniel Bourke" is one course with two
-- teachers, but Course had a single lecturerId, so the importer kept taughtBy[0]
-- and dropped the rest and the admin form could only ever hold one name.
--
-- Purely additive, like the resources migration beside this file: it creates the
-- join table and backfills it from the column that already exists. Course
-- ."lecturerId" is deliberately NOT dropped — the API keeps it in step with the
-- first lecturer for one release so a rollback stays safe and a client built
-- against the old response shape keeps working. The drops that `prisma migrate
-- diff` also asks for (Enrollment, LessonProgress, Course.enrollmentCount)
-- destroy rows and still wait for an explicit go-ahead.
--
-- IF NOT EXISTS / ON CONFLICT throughout, so a half-applied run can be repeated.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CourseLecturer" (
    "courseId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseLecturer_pkey" PRIMARY KEY ("courseId","lecturerId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseLecturer_lecturerId_idx" ON "CourseLecturer"("lecturerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseLecturer_courseId_orderIndex_idx" ON "CourseLecturer"("courseId", "orderIndex");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CourseLecturer" ADD CONSTRAINT "CourseLecturer_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "CourseLecturer" ADD CONSTRAINT "CourseLecturer_lecturerId_fkey"
    FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: every course that already names a lecturer becomes that course's
-- first credit. Soft-deleted courses are included — they still show their
-- teacher if they are restored.
INSERT INTO "CourseLecturer" ("courseId", "lecturerId", "orderIndex")
SELECT "id", "lecturerId", 0
FROM "Course"
WHERE "lecturerId" IS NOT NULL
ON CONFLICT ("courseId", "lecturerId") DO NOTHING;
