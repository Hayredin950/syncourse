-- Additive half of `prisma migrate diff` for the live database: it creates the
-- Resource/ResourceTag/ResourceMedia/CirclePost tables the deployed API needs
-- and widens DownloadEvent.lessonId. The drops the same diff asked for
-- (Enrollment, LessonProgress, Course.enrollmentCount) are deliberately left
-- out — they destroy rows, so they wait for an explicit go-ahead. Extra tables
-- and columns are harmless to Prisma, which names every column it reads.
-- IF NOT EXISTS added so a half-applied run can be repeated safely.

-- AlterTable
ALTER TABLE "DownloadEvent" ALTER COLUMN "lessonId" DROP NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Resource" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cheat-sheet',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "bodyMd" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "categoryId" TEXT,
    "organizationId" TEXT,
    "lecturerId" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "readMinutes" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ResourceTag" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "ResourceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ResourceMedia" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "url" TEXT,
    "telegramFileId" TEXT,
    "fileName" TEXT,
    "fileSizeMb" DOUBLE PRECISION,
    "caption" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResourceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CirclePost" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "courseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CirclePost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Resource_slug_key" ON "Resource"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_type_publishedAt_idx" ON "Resource"("type", "publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_publishedAt_idx" ON "Resource"("publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ResourceTag_resourceId_idx" ON "ResourceTag"("resourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ResourceMedia_resourceId_orderIndex_idx" ON "ResourceMedia"("resourceId", "orderIndex");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CirclePost_circleId_createdAt_idx" ON "CirclePost"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DownloadEvent_userId_createdAt_idx" ON "DownloadEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTag" ADD CONSTRAINT "ResourceTag_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceMedia" ADD CONSTRAINT "ResourceMedia_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirclePost" ADD CONSTRAINT "CirclePost_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirclePost" ADD CONSTRAINT "CirclePost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirclePost" ADD CONSTRAINT "CirclePost_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
