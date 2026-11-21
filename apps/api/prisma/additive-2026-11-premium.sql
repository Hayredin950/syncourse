-- Additive migration: progress, certificates and gift passes.
--
-- Production is a managed Neon database and the project rules forbid
-- `prisma db push`. Every statement here is safe to run more than once.

CREATE TABLE IF NOT EXISTS "LessonProgress" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("userId", "lessonId")
);

CREATE INDEX IF NOT EXISTS "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

CREATE TABLE IF NOT EXISTS "Certificate" (
  "id" TEXT NOT NULL,
  "serial" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_serial_key" ON "Certificate"("serial");
CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_userId_courseId_key" ON "Certificate"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "Certificate_courseId_idx" ON "Certificate"("courseId");

CREATE TABLE IF NOT EXISTS "RedeemCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedeemCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RedeemCode_code_key" ON "RedeemCode"("code");

CREATE TABLE IF NOT EXISTS "RedeemRedemption" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL REFERENCES "RedeemCode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedeemRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RedeemRedemption_codeId_userId_key" ON "RedeemRedemption"("codeId", "userId");
CREATE INDEX IF NOT EXISTS "RedeemRedemption_userId_idx" ON "RedeemRedemption"("userId");

-- Archive-course completion: courses imported from Telegram have no Lesson
-- rows, so each Telegram file is the trackable unit instead.
CREATE TABLE IF NOT EXISTS "CourseFileProgress" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "courseFileId" TEXT NOT NULL REFERENCES "TelegramCourseLink"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseFileProgress_pkey" PRIMARY KEY ("userId", "courseFileId")
);

CREATE INDEX IF NOT EXISTS "CourseFileProgress_courseFileId_idx" ON "CourseFileProgress"("courseFileId");
CREATE INDEX IF NOT EXISTS "CourseFileProgress_userId_courseId_idx" ON "CourseFileProgress"("userId", "courseId");
