import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../../search/search.service';

/**
 * Retrieval for the assistant: the part that decides what the model is allowed
 * to see.
 *
 * Two rules shape it:
 *
 *  1. **Grounding.** Sources are real rows — ZIP transcripts, PDFs, notes and
 *     lesson titles — never the model's memory. A question with no matching
 *     material produces no sources, and the caller says so instead of guessing.
 *  2. **Premium is gated here, not in the prompt.** If the reader cannot open a
 *     course, its text is dropped *before* the prompt is built, so a free-tier
 *     provider never receives paid content and the answer cannot quote it back.
 *     The course still appears as a locked suggestion.
 */

export interface RetrievedCourse {
  id: string;
  title: string;
  slug: string;
  isPremium: boolean;
  level: string;
  ratingAvg: number;
  lecturerName: string | null;
}

export interface RetrievedSource {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  /** subtitle | pdf | text | json | html | entry-name | lesson */
  kind: string;
  /** ZIP entry or attachment name; empty for lesson titles. */
  name: string;
  moduleTitle: string | null;
  text: string;
}

export interface Retrieval {
  keywords: string[];
  courses: RetrievedCourse[];
  /** Only sources whose text the reader may read. Safe to send to a provider. */
  sources: RetrievedSource[];
  /** Courses that matched but are locked for this reader. */
  locked: RetrievedCourse[];
  premiumActive: boolean;
}

/** Question words that carry no subject and would match half the catalogue. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'because',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'whom', 'whose',
  'do', 'does', 'did', 'doing', 'done', 'i', 'you', 'we', 'they', 'it', 'he',
  'she', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'to', 'of',
  'in', 'on', 'for', 'with', 'about', 'from', 'by', 'at', 'as', 'this', 'that',
  'these', 'those', 'can', 'could', 'should', 'would', 'will', 'shall', 'may',
  'might', 'must', 'my', 'me', 'your', 'our', 'their', 'there', 'here',
  'please', 'explain', 'tell', 'show', 'give', 'want', 'need', 'learn',
  'learning', 'course', 'courses', 'lesson', 'lessons', 'video', 'videos',
  'class', 'classes', 'syncourse', 'help', 'best', 'good', 'start', 'started',
  'starting', 'begin', 'beginner', 'beginning', 'get', 'got', 'make', 'made',
  'like', 'some', 'any', 'all', 'more', 'most', 'much', 'many', 'very', 'also',
  'just', 'only', 'not', 'no', 'yes', 'use', 'using', 'used', 'work', 'works',
  'working', 'thing', 'things', 'something', 'anything', 'difference', 'between',
]);

const MAX_SOURCES = 8;
const MAX_PER_COURSE = 3;
const CHUNK_CHARS = 1_300;
const SNIPPET_CHARS = 280;

export function keywordsOf(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)),
    ),
  ).slice(0, 8);
}

/** A short window around the first keyword hit, so a citation shows why it matched. */
export function snippetOf(text: string, keywords: string[], size = SNIPPET_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= size) return flat;
  const lower = flat.toLowerCase();
  let at = -1;
  for (const k of keywords) {
    const i = lower.indexOf(k.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = at <= 60 ? 0 : at - 60;
  const end = Math.min(start + size, flat.length);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger('AssistantRetrieval');

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  /** Same rule the course pages use: a plan that is active today. */
  async premiumActive(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, planExpiresAt: true },
    });
    return !!user && user.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
  }

  async retrieve(
    question: string,
    opts: { courseSlug?: string; userId?: string; limit?: number } = {},
  ): Promise<Retrieval> {
    const keywords = keywordsOf(question);
    const premiumActive = await this.premiumActive(opts.userId);
    const limit = Math.min(Math.max(opts.limit ?? MAX_SOURCES, 1), 12);

    // 1. Candidate courses. An anchor is the whole world; otherwise use the
    //    same ranked search the search page runs, but ask for ids only — the
    //    assistant renders no cards, so loading every section and lesson would
    //    be pure waste on a free database tier.
    let candidateIds: string[] = [];

    if (opts.courseSlug) {
      const anchor = await this.prisma.course.findFirst({
        where: { slug: opts.courseSlug, deletedAt: null },
        select: { id: true },
      });
      if (anchor) candidateIds = [anchor.id];
    }

    if (candidateIds.length === 0) {
      candidateIds = await this.rankedIdsFor(question);
    }

    // 2. Text. Restrict to the candidates when there are any; a question the
    //    catalogue search could not match still deserves one honest look inside
    //    the indexed transcripts.
    const chunkRows = await this.searchChunks(keywords, candidateIds, limit * 2);
    const chunkCourseIds = Array.from(new Set(chunkRows.map((r) => r.courseId)));
    const allIds = Array.from(new Set([...candidateIds, ...chunkCourseIds]));

    // The light projection: exactly the fields the answer and its rail show.
    const rows = await this.prisma.course.findMany({
      where: { id: { in: allIds }, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        isPremium: true,
        ratingAvg: true,
        level: { select: { name: true } },
        lecturers: {
          select: { lecturer: { select: { name: true } } },
          orderBy: { orderIndex: 'asc' },
          take: 1,
        },
      },
    });
    const byId = new Map<string, RetrievedCourse>(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          title: r.title,
          slug: r.slug,
          isPremium: r.isPremium,
          level: r.level?.name ?? 'All Levels',
          ratingAvg: r.ratingAvg,
          lecturerName: r.lecturers[0]?.lecturer.name ?? null,
        },
      ]),
    );

    const courses = allIds
      .map((id) => byId.get(id))
      .filter((c): c is RetrievedCourse => Boolean(c));

    // 3. Premium gate before anything leaves this method.
    const locked = courses.filter((c) => c.isPremium && !premiumActive);
    const lockedIds = new Set(locked.map((c) => c.id));

    const sources: RetrievedSource[] = [];
    const perCourse = new Map<string, number>();
    for (const row of chunkRows) {
      if (lockedIds.has(row.courseId)) continue;
      const course = byId.get(row.courseId);
      if (!course) continue;
      const used = perCourse.get(row.courseId) ?? 0;
      if (used >= MAX_PER_COURSE) continue;
      if (sources.length >= limit) break;
      perCourse.set(row.courseId, used + 1);
      sources.push({
        courseId: row.courseId,
        courseTitle: course.title,
        courseSlug: course.slug,
        kind: row.sourceKind,
        name: row.sourceName,
        moduleTitle: row.moduleTitle,
        text: row.text,
      });
    }

    // 4. Courses with no indexed text still have a syllabus. Lesson titles are
    //    real material and give the answer something concrete to point at.
    if (sources.length < 3) {
      const lessons = await this.lessonSources(allIds, keywords, lockedIds, limit - sources.length);
      for (const s of lessons) {
        if (sources.length >= limit) break;
        sources.push(s);
      }
    }

    return {
      keywords,
      courses: courses.filter((c) => !lockedIds.has(c.id)).slice(0, limit),
      sources,
      locked,
      premiumActive,
    };
  }

  /**
   * Ranked course ids only. `SearchService.search()` loads full cards for the
   * search page; the assistant needs the ranking, not the rendering.
   */
  private async rankedIdsFor(question: string): Promise<string[]> {
    try {
      return await this.search.rankedCourseIds(question, 8);
    } catch (err) {
      // A cold database or a missing pg_trgm must not turn a question into a
      // 500. A plain title/description match is a worse ranking, not a failure.
      this.logger.warn(`ranked search failed, falling back to a title match: ${(err as Error).message}`);
      const keywords = keywordsOf(question);
      if (keywords.length === 0) return [];
      const rows = await this.prisma.course.findMany({
        where: {
          deletedAt: null,
          OR: keywords.flatMap((k) => [
            { title: { contains: k, mode: 'insensitive' as const } },
            { description: { contains: k, mode: 'insensitive' as const } },
          ]),
        },
        select: { id: true },
        orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
        take: 8,
      });
      return rows.map((r) => r.id);
    }
  }

  /**
   * Rank chunk text with the same Postgres full-text search the site uses, with
   * an ILIKE fallback for partial words ("pyth" must still find Python).
   */
  private async searchChunks(
    keywords: string[],
    courseIds: string[],
    take: number,
  ): Promise<
    Array<{
      courseId: string;
      sourceKind: string;
      sourceName: string;
      moduleTitle: string | null;
      text: string;
      rank: number;
    }>
  > {
    if (keywords.length === 0) return [];
    const tsQuery = keywords.join(' or ');
    const patterns = keywords.map((k) => `%${k}%`);
    const allCourses = courseIds.length === 0;

    try {
      return await this.prisma.$queryRaw<
        Array<{
          courseId: string;
          sourceKind: string;
          sourceName: string;
          moduleTitle: string | null;
          text: string;
          rank: number;
        }>
      >`
        SELECT ch."courseId"                        AS "courseId",
               ch."sourceKind"                      AS "sourceKind",
               ch."sourceName"                      AS "sourceName",
               ch."moduleTitle"                     AS "moduleTitle",
               left(ch.text, ${CHUNK_CHARS}::int)   AS "text",
               ts_rank(to_tsvector('simple', ch.text), websearch_to_tsquery('simple', ${tsQuery})) AS "rank"
        FROM "ContentChunk" ch
        WHERE (${allCourses} OR ch."courseId" = ANY(${courseIds}::text[]))
          AND (
            to_tsvector('simple', ch.text) @@ websearch_to_tsquery('simple', ${tsQuery})
            OR ch.text ILIKE ANY(${patterns}::text[])
          )
        ORDER BY "rank" DESC, length(ch.text) ASC
        LIMIT ${take}::int
      `;
    } catch (err) {
      // pg_trgm missing, a language the `simple` config dislikes, a cold
      // connection — retrieval must not take the endpoint down with it.
      this.logger.warn(`chunk search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async lessonSources(
    courseIds: string[],
    keywords: string[],
    lockedIds: Set<string>,
    take: number,
  ): Promise<RetrievedSource[]> {
    if (courseIds.length === 0 || take <= 0) return [];
    const rows = await this.prisma.lesson.findMany({
      where: { courseId: { in: courseIds.filter((id) => !lockedIds.has(id)) } },
      select: {
        courseId: true,
        title: true,
        durationSec: true,
        section: { select: { title: true, orderIndex: true } },
        course: { select: { title: true, slug: true } },
      },
      orderBy: [{ section: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      take: 120,
    });
    if (rows.length === 0) return [];

    const lower = keywords.map((k) => k.toLowerCase());
    const scored = rows.map((r) => {
      const haystack = `${r.section?.title ?? ''} ${r.title}`.toLowerCase();
      const score = lower.reduce((n, k) => n + (haystack.includes(k) ? 1 : 0), 0);
      return { r, score };
    });

    // Prefer lessons that mention the question; if none do, fall back to the
    // syllabus order so the answer can still say what the course teaches.
    const relevant = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    const chosen = (relevant.length > 0 ? relevant : scored).slice(0, take);

    const perCourse = new Map<string, number>();
    const out: RetrievedSource[] = [];
    for (const { r } of chosen) {
      const used = perCourse.get(r.courseId) ?? 0;
      if (used >= MAX_PER_COURSE) continue;
      perCourse.set(r.courseId, used + 1);
      const minutes = Math.max(1, Math.round(r.durationSec / 60));
      out.push({
        courseId: r.courseId,
        courseTitle: r.course.title,
        courseSlug: r.course.slug,
        kind: 'lesson',
        name: r.title,
        moduleTitle: r.section?.title ?? null,
        text: `${r.section?.title ? `${r.section.title} · ` : ''}${r.title} (${minutes} min)`,
      });
    }
    return out;
  }
}
