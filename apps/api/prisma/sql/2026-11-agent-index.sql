-- 2026-11 — agent & search index (ADDITIVE ONLY)
--
-- Apply with:
--   psql "$DATABASE_URL" -f apps/api/prisma/sql/2026-11-agent-index.sql
--
-- Why hand-written instead of `prisma db push`:
-- the live database still contains `Enrollment`, `LessonProgress` and
-- `Course.enrollmentCount`, which are no longer in `schema.prisma`. A schema
-- sync would DROP them. Nothing here removes or rewrites existing data; it only
-- creates new search/agent structures.

-- ---------------------------------------------------------------
-- Extensions (available on the Neon free tier)
-- ---------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------
-- New tables (must match schema.prisma)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ContentChunk" (
    "id"          TEXT NOT NULL,
    "courseId"    TEXT NOT NULL,
    "linkId"      TEXT,
    "sourceKind"  TEXT NOT NULL,
    "sourceName"  TEXT NOT NULL DEFAULT '',
    "moduleTitle" TEXT,
    "partIndex"   INTEGER,
    "ordinal"     INTEGER NOT NULL DEFAULT 0,
    "text"        TEXT NOT NULL,
    "charCount"   INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SearchSynonym" (
    "id"        TEXT NOT NULL,
    "term"      TEXT NOT NULL,
    "expandsTo" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SearchClick" (
    "id"        TEXT NOT NULL,
    "query"     TEXT NOT NULL,
    "courseId"  TEXT NOT NULL,
    "userId"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IngestDraft" (
    "id"               TEXT NOT NULL,
    "chatId"           BIGINT NOT NULL,
    "chatUsername"     TEXT,
    "topicId"          BIGINT,
    "topicName"        TEXT,
    "messageIds"       BIGINT[],
    "payload"          JSONB NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "error"            TEXT,
    "approvedCourseId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestDraft_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------
-- Indexer state on the existing attachment table
-- ---------------------------------------------------------------

ALTER TABLE "TelegramCourseLink"
    ADD COLUMN IF NOT EXISTS "indexStatus" TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "indexedAt"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "indexError"  TEXT;

-- ---------------------------------------------------------------
-- Constraints & indexes
-- ---------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "ContentChunk_linkId_sourceName_ordinal_key"
    ON "ContentChunk"("linkId", "sourceName", "ordinal");
CREATE INDEX IF NOT EXISTS "ContentChunk_courseId_idx"    ON "ContentChunk"("courseId");
CREATE INDEX IF NOT EXISTS "ContentChunk_sourceKind_idx"  ON "ContentChunk"("sourceKind");

CREATE UNIQUE INDEX IF NOT EXISTS "SearchSynonym_term_key" ON "SearchSynonym"("term");
CREATE INDEX IF NOT EXISTS "SearchClick_query_idx"    ON "SearchClick"("query");
CREATE INDEX IF NOT EXISTS "SearchClick_courseId_idx" ON "SearchClick"("courseId");
CREATE INDEX IF NOT EXISTS "IngestDraft_status_createdAt_idx" ON "IngestDraft"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "IngestDraft_chatId_topicId_idx"   ON "IngestDraft"("chatId", "topicId");
CREATE INDEX IF NOT EXISTS "TelegramCourseLink_indexStatus_idx" ON "TelegramCourseLink"("indexStatus");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentChunk_courseId_fkey') THEN
        ALTER TABLE "ContentChunk"
            ADD CONSTRAINT "ContentChunk_courseId_fkey"
            FOREIGN KEY ("courseId") REFERENCES "Course"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentChunk_linkId_fkey') THEN
        ALTER TABLE "ContentChunk"
            ADD CONSTRAINT "ContentChunk_linkId_fkey"
            FOREIGN KEY ("linkId") REFERENCES "TelegramCourseLink"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SearchClick_courseId_fkey') THEN
        ALTER TABLE "SearchClick"
            ADD CONSTRAINT "SearchClick_courseId_fkey"
            FOREIGN KEY ("courseId") REFERENCES "Course"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------
-- Search indexes
--
-- Full-text is what makes "machine learning" rank above a course that merely
-- mentions ML in its third paragraph. Trigram is what makes "pythn" work.
-- Both expressions must match the ones SearchService uses, or Postgres will
-- ignore the indexes.
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Course_fts_idx" ON "Course" USING GIN (
    to_tsvector('simple',
        coalesce("title", '') || ' ' ||
        coalesce("description", '') || ' ' ||
        coalesce("prerequisites", '')
    )
);

CREATE INDEX IF NOT EXISTS "Course_title_trgm_idx" ON "Course" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Course_desc_trgm_idx"  ON "Course" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CourseTag_tag_trgm_idx" ON "CourseTag" USING GIN ("tag" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lecturer_name_trgm_idx" ON "Lecturer" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Organization_name_trgm_idx" ON "Organization" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ContentChunk_text_fts_idx" ON "ContentChunk" USING GIN (
    to_tsvector('simple', "text")
);
CREATE INDEX IF NOT EXISTS "ContentChunk_text_trgm_idx" ON "ContentChunk" USING GIN ("text" gin_trgm_ops);

-- ---------------------------------------------------------------
-- Seed synonyms (safe to re-run)
-- ---------------------------------------------------------------

INSERT INTO "SearchSynonym" ("id", "term", "expandsTo", "createdAt", "updatedAt")
VALUES
    ('syn_ml',   'ml',   ARRAY['machine learning'],                              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_ai',   'ai',   ARRAY['artificial intelligence'],                       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_js',   'js',   ARRAY['javascript'],                                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_ts',   'ts',   ARRAY['typescript'],                                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_rag',  'rag',  ARRAY['retrieval augmented generation', 'retrieval-augmented generation'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_llm',  'llm',  ARRAY['large language model'],                          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_llms', 'llms', ARRAY['large language models'],                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_nlp',  'nlp',  ARRAY['natural language processing'],                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_cv',   'cv',   ARRAY['computer vision'],                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_dl',   'dl',   ARRAY['deep learning'],                                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_oop',  'oop',  ARRAY['object oriented programming'],                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_ui',   'ui',   ARRAY['user interface'],                                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_ux',   'ux',   ARRAY['user experience'],                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_db',   'db',   ARRAY['database'],                                       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_k8s',  'k8s',  ARRAY['kubernetes'],                                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_aws',  'aws',  ARRAY['amazon web services'],                            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_gcp',  'gcp',  ARRAY['google cloud'],                                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('syn_csharp', 'csharp', ARRAY['c#'],                                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("term") DO NOTHING;
