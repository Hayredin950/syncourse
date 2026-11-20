import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcesService } from '../resources/resources.service';

/**
 * Global search.
 *
 * The original implementation was case-insensitive `LIKE` across five columns,
 * ordered by rating and downloads. That finds a course only when the exact
 * letters appear, so "pythn" missed Python, "ML" missed Machine Learning, and
 * nothing inside a ZIP was searchable at all.
 *
 * Ranking now blends four signals:
 *   1. Postgres full-text  — title + description + prerequisites (stemmed)
 *   2. trigram similarity  — typos and partial words ("pythn", "javscript")
 *   3. synonym expansion   — "ml" also searches "machine learning"
 *   4. lesson chunks       — text extracted from ZIPs (subtitles, PDFs, notes)
 *
 * Quality (rating) and popularity (downloads) only break ties; they must not
 * outrank a genuine match. The response shape is unchanged, so web and mobile
 * need no update.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger('Search');

  /**
   * Synonyms change rarely and are read on every keystroke of the search box.
   * Five minutes is short enough that an admin edit shows up without a deploy,
   * and long enough that a typing session does not hammer the table.
   */
  private synonymCache: { at: number; rows: Array<{ term: string; expandsTo: string[] }> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
  ) {}

  async search(q: string, opts: { limit?: number; offset?: number; recordTrending?: boolean } = {}) {
    const query = (q || '').trim();
    // Never let a query string turn into NaN/negative paging values: Prisma
    // throws on `take: NaN`, which surfaced as a 500 from /search?limit=abc.
    const limit = Number.isFinite(opts.limit)
      ? Math.min(Math.max(Math.trunc(opts.limit as number), 1), 50)
      : 20;
    const offset = Number.isFinite(opts.offset)
      ? Math.max(Math.trunc(opts.offset as number), 0)
      : 0;

    // Record only a real search, not every prefix the debounced input sent.
    // The assistant reuses this ranking but its full questions must not show up
    // in "trending searches" — they are sentences, not catalog queries.
    if (query.length >= 3 && opts.recordTrending !== false) {
      await this.upsertTrending(query);
    }

    const [trending] = await Promise.all([
      this.prisma.trendingQuery.findMany({ orderBy: { count: 'desc' }, take: 10 }),
    ]);

    if (!query) {
      return this.browse(limit, offset, trending.map((t) => t.query));
    }

    const ranked = await this.rankedIds(query, limit, offset);
    if (!ranked) {
      // A database without pg_trgm (or a raw-SQL failure) must still return
      // results. The plain path is slower but never breaks the page.
      return this.legacySearch(query, limit, offset, trending.map((t) => t.query));
    }

    const [courses, lecturers, organizations, resources] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: ranked.ids } },
        include: courseInclude,
      }),
      this.prisma.lecturer.findMany({
        where: query.length >= 3 ? { name: { contains: query, mode: 'insensitive' } } : undefined,
        take: 6,
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.findMany({
        where: query.length >= 3 ? { name: { contains: query, mode: 'insensitive' } } : undefined,
        take: 6,
        orderBy: { name: 'asc' },
      }),
      this.resources.search(query, 8),
    ]);

    // `findMany` returns whatever order Postgres likes; the ranking is the
    // point, so put the rows back in the order the SQL produced.
    const byId = new Map(courses.map((c) => [c.id, c]));
    const ordered = ranked.ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));

    return {
      query,
      // `count(*) OVER()` from the ranked query — the real match count, not the
      // page size.
      total: ranked.total,
      limit,
      offset,
      courses: ordered.map(summary),
      lecturers: lecturers.map((l) => ({ id: l.id, name: l.name, slug: l.slug, photoUrl: l.photoUrl })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug, logoUrl: o.logoUrl })),
      resources,
      trending: trending.map((t) => t.query),
    };
  }

  /** "Everyone searching" chips — before the user types anything. */
  async trending() {
    const rows = await this.prisma.trendingQuery.findMany({ orderBy: { count: 'desc' }, take: 12 });
    return { trending: rows.map((r) => r.query) };
  }

  /**
   * Ranked course ids only.
   *
   * The search page needs full cards, so `search()` loads sections and lessons
   * to compute durations and counts. The assistant only needs the ranking, and
   * loading every section for eight courses is a lot of work to throw away —
   * especially on a free database tier. Same ranking, minimal payload.
   */
  async rankedCourseIds(q: string, limit = 8) {
    const query = (q || '').trim();
    if (!query) return [];
    const take = Math.min(Math.max(Math.trunc(limit) || 8, 1), 20);

    const ranked = await this.rankedIds(query, take, 0);
    if (ranked) return ranked.ids;

    // No pg_trgm (or the raw query failed): the plain path still orders by
    // relevance-ish quality, so the assistant is never worse than "nothing".
    const fallback = await this.legacySearch(query, take, 0, []);
    return fallback.courses.map((c) => c.id);
  }

  /**
   * A result was opened from the search page.
   *
   * Recording is best-effort by design: the reader is navigating to a course
   * while this request is in flight, so a deleted course, a missing table or a
   * cold database must not surface as an error. The click only breaks ties in
   * ranking — it never makes an unrelated course match.
   */
  async recordClick(query: string, courseId: string, userId?: string) {
    const normalized = (query || '').trim().toLowerCase().slice(0, 200);
    if (normalized.length < 2 || !courseId) return { recorded: false };

    try {
      // A reload or a back-navigation is not a second vote. One click per
      // (reader, query, course) per ten minutes is enough to learn the pattern.
      if (userId) {
        const recent = await this.prisma.searchClick.findFirst({
          where: {
            userId,
            query: normalized,
            courseId,
            createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
          },
          select: { id: true },
        });
        if (recent) return { recorded: false, duplicate: true };
      }

      await this.prisma.searchClick.create({
        data: { query: normalized, courseId, userId: userId ?? null },
      });
      return { recorded: true };
    } catch {
      return { recorded: false };
    }
  }

  // ---------------------------------------------------------------
  // Ranked path
  // ---------------------------------------------------------------

  /**
   * Returns ids in rank order, or null when the database cannot run the query
   * (missing extension, older Postgres). Callers fall back to the LIKE path.
   */
  private async rankedIds(
    query: string,
    limit: number,
    offset: number,
  ): Promise<{ ids: string[]; total: number } | null> {
    const expansions = await this.expansionsFor(query);
    const expansionText = expansions.join(' OR ');
    const useTrigram = query.replace(/\s+/g, '').length >= 3;

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; total: bigint }>
      >(Prisma.sql`
        WITH q AS (
          SELECT
            ${query}::text AS raw,
            (
              websearch_to_tsquery('simple', ${query}) ||
              websearch_to_tsquery('simple', ${expansionText})
            ) AS tsq
        ),
        maxes AS (
          SELECT greatest(coalesce(max("downloadCount"), 0), 1)::float AS max_downloads
          FROM "Course"
          WHERE "deletedAt" IS NULL
        ),
        -- What readers actually opened for this exact query. Used only as a
        -- tie-breaker, and only recent clicks count: a term that moved on
        -- should not stay pinned to last year's answer.
        clickstats AS (
          SELECT "courseId", count(*)::float AS clicks
          FROM "SearchClick"
          WHERE "query" = lower(${query}::text)
            AND "createdAt" > now() - interval '90 days'
          GROUP BY "courseId"
        ),
        clickmax AS (
          SELECT greatest(coalesce(max(clicks), 0), 1)::float AS max_clicks
          FROM clickstats
        ),
        matched AS (
          SELECT
            c.id,
            ts_rank(
              to_tsvector('simple',
                coalesce(c."title", '') || ' ' ||
                coalesce(c."description", '') || ' ' ||
                coalesce(c."prerequisites", '')
              ),
              q.tsq
            ) AS ft,
            -- Whole-title similarity is near zero for a typo in one word
            -- ("pythn" vs a long course title). word_similarity compares the
            -- query against the best word in the field, which is what a reader
            -- means. Keep both so an exact short title still scores highly.
            greatest(
              similarity(c."title", q.raw),
              word_similarity(q.raw, c."title")
            ) AS title_sim,
            greatest(
              similarity(coalesce(c."description", ''), q.raw),
              word_similarity(q.raw, coalesce(c."description", ''))
            ) AS desc_sim,
            EXISTS (
              SELECT 1 FROM "ContentChunk" ch
              WHERE ch."courseId" = c.id
                AND (
                  to_tsvector('simple', ch."text") @@ q.tsq
                  OR (${useTrigram} AND ch."text" ILIKE '%' || q.raw || '%')
                )
            ) AS chunk_hit,
            c."ratingAvg"::float AS rating,
            c."downloadCount"::float AS downloads,
            m.max_downloads,
            coalesce(cs.clicks, 0) / cm.max_clicks AS click_rate
          FROM "Course" c
          CROSS JOIN q
          CROSS JOIN maxes m
          CROSS JOIN clickmax cm
          LEFT JOIN clickstats cs ON cs."courseId" = c.id
          WHERE c."deletedAt" IS NULL
            AND (
              to_tsvector('simple',
                coalesce(c."title", '') || ' ' ||
                coalesce(c."description", '') || ' ' ||
                coalesce(c."prerequisites", '')
              ) @@ q.tsq
              OR (${useTrigram} AND (
                c."title" % q.raw
                OR word_similarity(q.raw, c."title") > 0.35
              ))
              OR (${useTrigram} AND (
                coalesce(c."description", '') % q.raw
                OR word_similarity(q.raw, coalesce(c."description", '')) > 0.35
              ))
              OR EXISTS (
                SELECT 1 FROM "CourseTag" t
                WHERE t."courseId" = c.id
                  AND (
                    t."tag" ILIKE '%' || q.raw || '%'
                    OR (${useTrigram} AND word_similarity(q.raw, t."tag") > 0.45)
                  )
              )
              OR EXISTS (
                SELECT 1 FROM "CourseCategory" cc
                JOIN "Category" cat ON cat."id" = cc."categoryId"
                WHERE cc."courseId" = c.id
                  AND (
                    cat."name" ILIKE '%' || q.raw || '%'
                    OR (${useTrigram} AND word_similarity(q.raw, cat."name") > 0.45)
                  )
              )
              OR EXISTS (
                SELECT 1 FROM "CourseLecturer" cl
                JOIN "Lecturer" l ON l."id" = cl."lecturerId"
                WHERE cl."courseId" = c.id
                  AND (
                    l."name" ILIKE '%' || q.raw || '%'
                    OR (${useTrigram} AND word_similarity(q.raw, l."name") > 0.45)
                  )
              )
              OR EXISTS (
                SELECT 1 FROM "ContentChunk" ch
                WHERE ch."courseId" = c.id
                  AND (
                    to_tsvector('simple', ch."text") @@ q.tsq
                    OR (${useTrigram} AND ch."text" ILIKE '%' || q.raw || '%')
                  )
              )
            )
        )
        SELECT
          id,
          count(*) OVER() AS total
        FROM matched
        ORDER BY (
          0.45 * least(ft * 8, 1)
          + 0.20 * greatest(title_sim, 0)
          + 0.05 * greatest(desc_sim, 0)
          + 0.10 * CASE WHEN chunk_hit THEN 1 ELSE 0 END
          + 0.10 * (rating / 5.0)
          + 0.10 * (ln(1 + downloads) / ln(1 + max_downloads))
          + 0.08 * greatest(click_rate, 0)
        ) DESC,
        rating DESC,
        downloads DESC
        LIMIT ${limit}::int OFFSET ${offset}::int
      `);

      return {
        ids: rows.map((r) => r.id),
        total: Number(rows[0]?.total ?? 0),
      };
    } catch (err) {
      // A missing pg_trgm extension is a deployment problem, not a user error.
      // Log once per call and let the caller use the LIKE fallback.
      this.logger.warn(`Ranked search unavailable, falling back: ${(err as Error).message}`);
      return null;
    }
  }

  /** Synonyms that apply to any word in the query. */
  private async expansionsFor(query: string): Promise<string[]> {
    const rows = await this.synonymRows();
    if (rows.length === 0) return [];
    const words = new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9#+]+/)
        .filter(Boolean),
    );
    const out: string[] = [];
    for (const row of rows) {
      if (!words.has(row.term)) continue;
      for (const value of row.expandsTo) {
        if (value && value.toLowerCase() !== query.toLowerCase()) out.push(value);
      }
    }
    return [...new Set(out)];
  }

  private async synonymRows(): Promise<Array<{ term: string; expandsTo: string[] }>> {
    const now = Date.now();
    if (this.synonymCache && now - this.synonymCache.at < 5 * 60_000) {
      return this.synonymCache.rows;
    }
    try {
      const rows = await this.prisma.searchSynonym.findMany({
        select: { term: true, expandsTo: true },
      });
      this.synonymCache = { at: now, rows };
      return rows;
    } catch {
      // Table missing (fresh local DB before the migration): search still works.
      this.synonymCache = { at: now, rows: [] };
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Empty query + fallback
  // ---------------------------------------------------------------

  private async browse(limit: number, offset: number, trending: string[]) {
    const [courses, total, lecturers, organizations] = await Promise.all([
      this.prisma.course.findMany({
        where: { deletedAt: null },
        orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
        take: limit,
        skip: offset,
        include: courseInclude,
      }),
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.lecturer.findMany({ take: 6, orderBy: { name: 'asc' } }),
      this.prisma.organization.findMany({ take: 6, orderBy: { name: 'asc' } }),
    ]);

    return {
      query: '',
      total,
      limit,
      offset,
      courses: courses.map(summary),
      lecturers: lecturers.map((l) => ({ id: l.id, name: l.name, slug: l.slug, photoUrl: l.photoUrl })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug, logoUrl: o.logoUrl })),
      resources: [],
      trending,
    };
  }

  /** Pre-index behaviour, kept as a safety net. */
  private async legacySearch(query: string, limit: number, offset: number, trending: string[]) {
    const insensitive = { contains: query, mode: 'insensitive' as const };
    const courseWhere: Prisma.CourseWhereInput = {
      deletedAt: null,
      OR: [
        { title: insensitive },
        { description: insensitive },
        { tags: { some: { tag: insensitive } } },
        { categories: { some: { category: { name: insensitive } } } },
        { lecturers: { some: { lecturer: { name: insensitive } } } },
      ],
    };

    const [courses, total, lecturers, organizations, resources] = await Promise.all([
      this.prisma.course.findMany({
        where: courseWhere,
        orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
        take: limit,
        skip: offset,
        include: courseInclude,
      }),
      this.prisma.course.count({ where: courseWhere }),
      this.prisma.lecturer.findMany({ where: { name: insensitive }, take: 6 }),
      this.prisma.organization.findMany({ where: { name: insensitive }, take: 6 }),
      this.resources.search(query, 8),
    ]);

    return {
      query,
      total,
      limit,
      offset,
      courses: courses.map(summary),
      lecturers: lecturers.map((l) => ({ id: l.id, name: l.name, slug: l.slug, photoUrl: l.photoUrl })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug, logoUrl: o.logoUrl })),
      resources,
      trending,
    };
  }

  private async upsertTrending(query: string) {
    const key = query.toLowerCase();
    await this.prisma.trendingQuery.upsert({
      where: { query: key },
      create: { query: key, count: 1 },
      update: { count: { increment: 1 }, lastSearchedAt: new Date() },
    });
  }
}

const courseInclude = {
  level: true,
  // Every teacher, in credited order — a course can be taught by several.
  lecturers: { include: { lecturer: true }, orderBy: { orderIndex: 'asc' } },
  organization: true,
  categories: { include: { category: true } },
  tags: true,
  audience: true,
  sections: { include: { lessons: true } },
} satisfies Prisma.CourseInclude;

type CourseWithRelations = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

function summary(c: CourseWithRelations) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl,
    level: c.level?.name ?? 'All Levels',
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    downloadCount: c.downloadCount,
    durationMin: c.sections.reduce(
      (s, sec) => s + sec.lessons.reduce((x, l) => x + l.durationSec, 0) / 60,
      0,
    ),
    lessonCount: c.sections.reduce((s, sec) => s + sec.lessons.length, 0),
    lecturerName: c.lecturers[0]?.lecturer.name ?? null,
    lecturerNames: c.lecturers.map((cl) => cl.lecturer.name),
    organizationName: c.organization?.name ?? null,
    categoryNames: c.categories.map((cc) => cc.category?.name ?? '').filter(Boolean),
    isPremium: c.isPremium,
    publishedAt: c.publishedAt,
  };
}
