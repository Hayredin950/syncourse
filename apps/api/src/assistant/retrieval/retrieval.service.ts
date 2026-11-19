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
  /** Used to build an honest "what is this course about" overview. */
  description?: string;
  tags?: string[];
  categories?: string[];
}

export interface RetrievedSource {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  /** subtitle | pdf | text | json | html | entry-name | lesson | course */
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
  // Generic product words: a question about "this web app" should not match
  // every PDF that happens to contain "app" or "web".
  'app', 'apps', 'application', 'applications', 'web', 'website', 'websites',
  'site', 'sites', 'webapp', 'platform', 'online', 'page', 'pages',
  'master', 'mastering', 'mastery', 'suggest', 'suggestion', 'suggestions',
  'recommend', 'recommendation', 'recommendations', 'take',
]);

/**
 * A reader asks for a subject, not for the exact words a course title uses.
 * "mobile app development" should find the Flutter course even though neither
 * word appears in its title; "dart" should not fall through to C#. Expansions
 * are search terms only — they never become claims.
 */
const TOPIC_EXPANSIONS: Record<string, string[]> = {
  mobile: ['flutter', 'dart', 'android', 'ios', 'swift', 'kotlin', 'react native'],
  flutter: ['dart', 'android', 'ios', 'mobile development'],
  dart: ['flutter', 'android', 'ios', 'mobile development'],
  android: ['kotlin', 'java', 'flutter', 'mobile development'],
  ios: ['swift', 'xcode', 'flutter', 'mobile development'],
  swift: ['ios', 'xcode', 'mobile development'],
  kotlin: ['android', 'java', 'mobile development'],
  frontend: ['html', 'css', 'javascript', 'typescript', 'react', 'web development'],
  front: ['frontend', 'html', 'css', 'javascript', 'react'],
  backend: ['node', 'express', 'api', 'server', 'database', 'sql'],
  back: ['backend', 'node', 'express', 'api', 'server'],
  fullstack: ['frontend', 'backend', 'javascript', 'react', 'node'],
  web: ['html', 'css', 'javascript', 'react', 'node', 'web development'],
  website: ['html', 'css', 'javascript', 'react', 'web development'],
  javascript: ['js', 'typescript', 'react', 'node'],
  js: ['javascript', 'typescript'],
  typescript: ['javascript', 'ts'],
  react: ['javascript', 'frontend', 'web development'],
  node: ['javascript', 'backend', 'express', 'api'],
  python: ['django', 'flask', 'pandas', 'numpy', 'machine learning'],
  ml: ['machine learning', 'deep learning', 'python', 'tensorflow', 'scikit-learn'],
  ai: ['artificial intelligence', 'machine learning', 'deep learning', 'llm', 'neural networks'],
  llm: ['large language model', 'generative ai', 'rag', 'prompt engineering'],
  rag: ['retrieval augmented generation', 'llm', 'embeddings', 'vector database'],
  data: ['data science', 'sql', 'python', 'pandas', 'analytics'],
  science: ['data science', 'machine learning'],
  security: ['cybersecurity', 'ethical hacking', 'penetration testing'],
  hacking: ['ethical hacking', 'penetration testing', 'cybersecurity'],
  cyber: ['cybersecurity', 'ethical hacking', 'network security'],
  cloud: ['aws', 'azure', 'gcp', 'devops', 'docker', 'kubernetes'],
  devops: ['docker', 'kubernetes', 'aws', 'ci/cd', 'cloud'],
  game: ['unity', 'unreal', 'game development', 'c#'],
  csharp: ['c#', '.net', 'unity'],
  'c#': ['csharp', '.net', 'unity'],
  database: ['sql', 'postgresql', 'mysql', 'mongodb'],
  sql: ['database', 'postgresql', 'mysql'],
  api: ['rest', 'backend', 'node', 'http'],
  design: ['ui', 'ux', 'figma', 'graphic design'],
  testing: ['qa', 'automation', 'selenium', 'jest'],
  automation: ['n8n', 'workflow', 'zapier', 'no-code'],
  n8n: ['automation', 'workflow', 'ai agents'],
  excel: ['spreadsheet', 'data analysis', 'formulas'],
  interview: ['technical interview', 'coding interview', 'algorithms', 'data structures'],
};

/** Multi-word intents that single-token expansion cannot catch. */
const PHRASE_EXPANSIONS: Array<[RegExp, string[]]> = [
  [/\bmobile\s+(?:app|application|development)\b/i, ['flutter', 'dart', 'android', 'ios']],
  [/\bweb\s+(?:app|application|site|development)\b/i, ['html', 'css', 'javascript', 'react']],
  [/\bmachine\s+learning\b/i, ['python', 'tensorflow', 'scikit-learn', 'data science']],
  [/\bdata\s+(?:science|analysis)\b/i, ['python', 'sql', 'pandas', 'statistics']],
  [/\bethical\s+hacking\b/i, ['penetration testing', 'cybersecurity', 'network security']],
  [/\bgame\s+development\b/i, ['unity', 'unreal', 'c#']],
];

const MAX_SOURCES = 8;
const MAX_PER_COURSE = 3;
const CHUNK_CHARS = 1_300;
const SNIPPET_CHARS = 280;
/** Course overviews are readable, but they should not outrank real lesson text. */
const WEAK_SOURCE_KINDS = new Set(['entry-name', 'archive-name']);

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

/**
 * The words the reader used, followed by the topics those words imply. The
 * originals stay first so a snippet is centred on what was actually asked.
 */
export function expandKeywords(question: string): string[] {
  const base = keywordsOf(question);
  const out = [...base];

  for (const term of base) {
    for (const expansion of TOPIC_EXPANSIONS[term] ?? []) out.push(expansion);
  }
  for (const [pattern, expansions] of PHRASE_EXPANSIONS) {
    if (pattern.test(question)) out.push(...expansions);
  }

  return Array.from(new Set(out.filter(Boolean))).slice(0, 20);
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
    const keywords = expandKeywords(question);
    const premiumActive = await this.premiumActive(opts.userId);
    const limit = Math.min(Math.max(opts.limit ?? MAX_SOURCES, 1), 12);

    // 1. Candidate courses. An anchor is the whole world; otherwise rank the
    //    catalogue against what the reader asked. The search page's ranking is
    //    one signal among several — a subject ("mobile") rarely appears in the
    //    title it should match ("Dart and Flutter"), so tags, categories and
    //    the description carry the rest.
    let candidateIds: string[] = [];

    if (opts.courseSlug) {
      const anchor = await this.prisma.course.findFirst({
        where: { slug: opts.courseSlug, deletedAt: null },
        select: { id: true },
      });
      if (anchor) candidateIds = [anchor.id];
    }

    if (candidateIds.length === 0) {
      candidateIds = await this.rankedCandidates(question, keywords);
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
        description: true,
        isPremium: true,
        ratingAvg: true,
        level: { select: { name: true } },
        tags: { select: { tag: true } },
        categories: { select: { category: { select: { name: true } } } },
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
          description: r.description,
          tags: r.tags.map((t) => t.tag),
          categories: r.categories.map((c) => c.category.name),
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
    // One citation per file: three chunks of the same PDF are three quotes and
    // one source, and repeating it pushes the other courses out of the answer.
    const seenFile = new Set<string>();
    // Archive names prove a course exists but say nothing about its content.
    // One per course is enough; the readable overview fills the next slot.
    const weakPerCourse = new Map<string, number>();
    for (const row of chunkRows) {
      if (lockedIds.has(row.courseId)) continue;
      const course = byId.get(row.courseId);
      if (!course) continue;
      const weak = WEAK_SOURCE_KINDS.has(row.sourceKind);
      if (weak && (weakPerCourse.get(row.courseId) ?? 0) >= 1) continue;
      const key = `${row.courseId}\u0000${row.sourceName}`;
      if (seenFile.has(key)) continue;
      const used = perCourse.get(row.courseId) ?? 0;
      if (used >= MAX_PER_COURSE) continue;
      if (sources.length >= limit) break;
      seenFile.add(key);
      perCourse.set(row.courseId, used + 1);
      if (weak) weakPerCourse.set(row.courseId, (weakPerCourse.get(row.courseId) ?? 0) + 1);
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

    // 4. A readable overview for the best candidates. Archive names alone
    //    ("2. A Dart Introduction.zip") prove the course exists but say
    //    nothing about what it teaches; the course row itself does.
    const substantial = new Set(
      sources.filter((s) => !WEAK_SOURCE_KINDS.has(s.kind)).map((s) => s.courseId),
    );
    for (const course of courses.slice(0, 3)) {
      if (lockedIds.has(course.id) || substantial.has(course.id)) continue;
      const used = perCourse.get(course.id) ?? 0;
      if (used >= MAX_PER_COURSE || sources.length >= limit) continue;
      perCourse.set(course.id, used + 1);
      substantial.add(course.id);
      sources.push(this.summarySource(course));
    }

    // 5. Courses with no indexed text still have a syllabus. Lesson titles are
    //    real material and give the answer something concrete to point at.
    if (sources.length < 3) {
      const lessons = await this.lessonSources(
        allIds,
        keywords,
        lockedIds,
        limit - sources.length,
        perCourse,
      );
      for (const s of lessons) {
        if (sources.length >= limit) break;
        sources.push(s);
      }
    }

    // Readable material leads the answer; an archive filename is the last
    // thing a reader should see quoted at them.
    const sourceRank = (kind: string) => (WEAK_SOURCE_KINDS.has(kind) ? 3 : kind === 'course' ? 2 : 1);
    sources.sort((a, b) => sourceRank(a.kind) - sourceRank(b.kind));

    return {
      keywords,
      courses: courses.filter((c) => !lockedIds.has(c.id)).slice(0, limit),
      sources,
      locked,
      premiumActive,
    };
  }

  /**
   * Rank the catalogue for the question in front of us.
   *
   * The search page ranks a *catalog query*; a question is longer and its
   * subject is often implied rather than written. "Which course should I take
   * to master mobile app development" contains neither "Flutter" nor "Dart",
   * so full-text search alone finds the wrong course. Tags, categories and the
   * description are what let the right course surface, and a search hit is
   * still given a strong bonus so typos and synonyms are not lost.
   */
  private async rankedCandidates(question: string, keywords: string[]): Promise<string[]> {
    const searchIds = await this.rankedIdsFor(question);
    if (keywords.length === 0) return searchIds;

    const primary = new Set(keywordsOf(question));

    let rows: Array<{
      id: string;
      title: string;
      description: string;
      ratingAvg: number;
      downloadCount: number;
      tags: Array<{ tag: string }>;
      categories: Array<{ category: { name: string } }>;
      lecturers: Array<{ lecturer: { name: string } }>;
    }>;
    try {
      rows = await this.prisma.course.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          description: true,
          ratingAvg: true,
          downloadCount: true,
          tags: { select: { tag: true } },
          categories: { select: { category: { select: { name: true } } } },
          lecturers: { select: { lecturer: { select: { name: true } } }, take: 1 },
        },
        take: 500,
      });
    } catch (err) {
      this.logger.warn(`course ranking failed, using search order: ${(err as Error).message}`);
      return searchIds;
    }

    const scored = rows
      .map((row) => {
        const title = row.title.toLowerCase();
        const description = (row.description ?? '').toLowerCase();
        const tags = row.tags.map((t) => t.tag.toLowerCase());
        const categories = row.categories.map((c) => c.category.name.toLowerCase());
        const lecturer = (row.lecturers[0]?.lecturer.name ?? '').toLowerCase();

        let score = 0;
        for (const term of keywords) {
          // A word the reader typed is worth more than a topic we inferred.
          const weight = primary.has(term) ? 1 : 0.65;
          const needle = term.toLowerCase();

          if (title.includes(needle)) score += 7 * weight;
          if (tags.some((t) => t === needle)) score += 5 * weight;
          else if (tags.some((t) => t.includes(needle))) score += 4 * weight;
          if (categories.some((c) => c.includes(needle))) score += 4 * weight;
          if (description.includes(needle)) score += 1.5 * weight;
          if (lecturer.includes(needle)) score += 3 * weight;
        }

        // Keep whatever the real search found. Its trigram and synonym paths
        // catch misspellings that an exact substring score cannot.
        const at = searchIds.indexOf(row.id);
        if (at >= 0) score += Math.max(2, 9 - at * 0.8);

        return { id: row.id, score, rating: row.ratingAvg, downloads: row.downloadCount };
      })
      .filter((row) => row.score >= 2)
      .sort((a, b) => b.score - a.score || b.rating - a.rating || b.downloads - a.downloads);

    const ranked = scored.map((row) => row.id);
    for (const id of searchIds) {
      if (!ranked.includes(id)) ranked.push(id);
    }
    return ranked.slice(0, 8);
  }

  /** The course row, described in the same words the course page uses. */
  private summarySource(course: RetrievedCourse): RetrievedSource {
    const where = course.categories?.length
      ? ` in ${course.categories.slice(0, 3).join(', ')}`
      : '';
    const text = [
      `${course.title} — ${course.level} course${where}.`,
      course.description?.trim(),
      course.tags?.length ? `Topics: ${course.tags.slice(0, 8).join(', ')}.` : '',
      course.lecturerName ? `Taught by ${course.lecturerName}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      courseId: course.id,
      courseTitle: course.title,
      courseSlug: course.slug,
      kind: 'course',
      name: 'Course overview',
      moduleTitle: null,
      text,
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
        ORDER BY CASE WHEN ch."sourceKind" IN ('entry-name', 'archive-name') THEN 1 ELSE 0 END,
                 "rank" DESC,
                 length(ch.text) ASC
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
    perCourse: Map<string, number>,
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
