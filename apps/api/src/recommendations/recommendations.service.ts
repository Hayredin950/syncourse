/**
 * recommendations.service.ts
 *
 * "More like this" and "For you", without an AI bill.
 *
 * Both answers come from the same thing: a *profile* of the signals a reader
 * has shown, scored against the catalogue. Categories, tags, lecturers and
 * level say what a course is about; rating, downloads and age say whether it is
 * worth opening today. Every weight below is a judgement someone can read and
 * disagree with, which is the point — a recommendation the operator cannot
 * explain is one they cannot fix.
 *
 * Why not embeddings: the free tier has no note-taking service, and a text
 * embedding would have to run for every course on every edit. This catalogue is
 * hand-curated and tagged, so the tags *are* the embedding.
 *
 * The service only chooses ids. `CatalogService.summariesByIds` renders the
 * cards, so recommendations and the rest of the site cannot disagree about what
 * a course card contains.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';

/**
 * Only the columns scoring needs. Sections and lessons are deliberately absent:
 * a candidate pool is hundreds of rows and the card is built later for the
 * handful that actually make the page.
 */
const featureSelect = {
  id: true,
  title: true,
  slug: true,
  levelId: true,
  ratingAvg: true,
  ratingCount: true,
  downloadCount: true,
  publishedAt: true,
  categories: { select: { categoryId: true } },
  tags: { select: { tag: true } },
  lecturers: { select: { lecturerId: true } },
} satisfies Prisma.CourseSelect;

type FeatureRow = Prisma.CourseGetPayload<{ select: typeof featureSelect }>;

interface Feature {
  id: string;
  levelId: string | null;
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  publishedAt: Date;
  categories: string[];
  tags: string[];
  lecturers: string[];
}

interface Profile {
  categories: Map<string, number>;
  tags: Map<string, number>;
  lecturers: Map<string, number>;
  levels: Map<string, number>;
  /** Courses the reader already acted on — never recommended back to them. */
  interacted: Set<string>;
  /**
   * Largest positive weight in each dimension. Overlaps are divided by this so
   * one very-loved category cannot drown out every other signal.
   */
  maxima: { categories: number; tags: number; lecturers: number; levels: number };
}

export interface RecommendationResult {
  /**
   * Why these courses are here. The UI can change its heading without guessing
   * from an empty list.
   */
  source: 'related' | 'personalised' | 'popular';
  courses: Awaited<ReturnType<CatalogService['summariesByIds']>>;
}

/** Weights for how strongly a kind of overlap pulls a course up. */
const SCORE = {
  category: 3.0,
  tag: 2.0,
  lecturer: 2.5,
  level: 0.75,
  quality: 0.6,
  popularity: 0.5,
  freshness: 0.25,
};

/** Interaction weights while building a reader's profile. */
const SIGNAL = {
  download: 2,
  save: 3,
  like: 4,
  click: 1,
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Clicks older than this no longer say much about current taste. */
const CLICK_WINDOW_DAYS = 90;
/** Courses published longer ago than this stop earning the freshness bonus. */
const FRESH_DAYS = 180;
/** Candidate rows scored in JS. Far more than the largest page, far less than a full scan. */
const CANDIDATE_LIMIT = 250;

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Courses that share a course's subject. Falls back to the popular list when
   * the anchor is untagged, which is the honest answer rather than an empty
   * "More like this" rail.
   */
  async similar(slug: string, userId?: string, limit = 8): Promise<RecommendationResult> {
    const take = clampLimit(limit);
    const base = await this.prisma.course.findFirst({
      where: { slug, deletedAt: null },
      select: featureSelect,
    });
    if (!base) throw new NotFoundException('Course not found');

    const profile = finishProfile(addToProfile(emptyProfile(), toFeature(base), 1));
    const where = this.relatedWhere(profile, [base.id]);
    if (!where) {
      return this.popular(userId, take, [base.id]);
    }

    const rows = await this.prisma.course.findMany({
      where,
      select: featureSelect,
      // A wide net ordered by reach: the scoring pass then reorders the top of
      // it. Without the order the pool would be arbitrary for a broad category.
      orderBy: [{ downloadCount: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    const picked = rank(profile, rows, take);
    // No popular filler here on purpose. "More like this" is a promise about
    // *this* course; a short honest rail beats a long one padded with a Quran
    // tafseer and a Flutter course because they happen to be top-rated.
    if (picked.length === 0) return this.popular(userId, take, [base.id]);
    return {
      source: 'related',
      courses: await this.catalog.summariesByIds(picked, userId),
    };
  }

  /**
   * A personalised queue. Signed out, or with no history at all, this is the
   * popular list — the same courses a new reader would see, not a blank rail.
   */
  async forYou(userId?: string, limit = 10): Promise<RecommendationResult> {
    const take = clampLimit(limit);
    if (!userId) return this.popular(undefined, take, []);

    const profile = await this.profileFor(userId);
    const hasTaste =
      profile.maxima.categories > 0 ||
      profile.maxima.tags > 0 ||
      profile.maxima.lecturers > 0 ||
      profile.maxima.levels > 0;
    if (!hasTaste) return this.popular(userId, take, [...profile.interacted]);

    const exclude = [...profile.interacted];
    const where = this.relatedWhere(profile, exclude);
    if (!where) return this.popular(userId, take, exclude);

    const rows = await this.prisma.course.findMany({
      where,
      select: featureSelect,
      orderBy: [{ downloadCount: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    const picked = rank(profile, rows, take);
    const ids = await this.topUp(picked, take, exclude);
    return {
      source: picked.length > 0 ? 'personalised' : 'popular',
      courses: await this.catalog.summariesByIds(ids, userId),
    };
  }

  // ---------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------

  /**
   * Everything a reader has done, folded into one taste profile:
   * downloads, saves, likes, ratings and search clicks. A two-star rating
   * subtracts, so one bad course does not poison a topic the reader otherwise
   * likes — only a pattern does.
   */
  private async profileFor(userId: string): Promise<Profile> {
    const since = new Date(Date.now() - CLICK_WINDOW_DAYS * DAY_MS);

    const [downloads, saves, likes, ratings, clicks] = await Promise.all([
      this.prisma.downloadEvent.groupBy({
        by: ['courseId'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.savedCourse.findMany({ where: { userId }, select: { courseId: true } }),
      this.prisma.likedCourse.findMany({ where: { userId }, select: { courseId: true } }),
      this.prisma.rating.findMany({ where: { userId }, select: { courseId: true, stars: true } }),
      this.prisma.searchClick.groupBy({
        by: ['courseId'],
        where: { userId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const weights = new Map<string, number>();
    const add = (courseId: string, weight: number) => {
      if (!courseId) return;
      weights.set(courseId, (weights.get(courseId) ?? 0) + weight);
    };

    for (const row of downloads) {
      // Ten downloads of one course is still one interest.
      add(row.courseId, SIGNAL.download * Math.min(row._count._all, 3));
    }
    for (const row of saves) add(row.courseId, SIGNAL.save);
    for (const row of likes) add(row.courseId, SIGNAL.like);
    for (const row of ratings) {
      const weight = row.stars >= 4 ? (row.stars - 3) * 2 : row.stars <= 2 ? -(3 - row.stars) * 2 : 0;
      add(row.courseId, weight);
    }
    for (const row of clicks) add(row.courseId, SIGNAL.click * Math.min(row._count._all, 3));

    const profile = emptyProfile();
    const ids = [...weights.keys()];
    if (ids.length === 0) return finishProfile(profile);

    const rows = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      select: featureSelect,
    });
    for (const row of rows) {
      profile.interacted.add(row.id);
      const weight = weights.get(row.id) ?? 0;
      if (weight !== 0) addToProfile(profile, toFeature(row), weight);
    }
    return finishProfile(profile);
  }

  /**
   * The candidate query: anything that shares *something* with the profile.
   * A single OR across four dimensions, so a course that matches on a tag but
   * not a category is still considered.
   */
  private relatedWhere(profile: Profile, excludeIds: string[]): Prisma.CourseWhereInput | null {
    const strongest = (map: Map<string, number>, n: number) =>
      [...map.entries()]
        .filter(([, weight]) => weight > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id]) => id);

    const categoryIds = strongest(profile.categories, 6);
    const tags = strongest(profile.tags, 8);
    const lecturerIds = strongest(profile.lecturers, 5);
    const levelIds = strongest(profile.levels, 3);

    const or: Prisma.CourseWhereInput[] = [];
    if (categoryIds.length) or.push({ categories: { some: { categoryId: { in: categoryIds } } } });
    if (tags.length) or.push({ tags: { some: { tag: { in: tags } } } });
    if (lecturerIds.length) or.push({ lecturers: { some: { lecturerId: { in: lecturerIds } } } });
    if (levelIds.length) or.push({ levelId: { in: levelIds } });
    if (or.length === 0) return null;

    return {
      deletedAt: null,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      OR: or,
    };
  }

  // ---------------------------------------------------------------
  // Fallbacks
  // ---------------------------------------------------------------

  private async popular(userId: string | undefined, limit: number, exclude: string[]): Promise<RecommendationResult> {
    const rows = await this.prisma.course.findMany({
      where: { deletedAt: null, ...(exclude.length ? { id: { notIn: exclude } } : {}) },
      // Same order the home page uses for its top-rated rail, so "popular"
      // means the same thing in both places.
      orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return {
      source: 'popular',
      courses: await this.catalog.summariesByIds(
        rows.map((r) => r.id),
        userId,
      ),
    };
  }

  /**
   * A short rail is worse than a full one, and there is always a catalogue
   * behind it. Fill the remainder with popular courses the reader has not
   * already acted on.
   */
  private async topUp(ids: string[], limit: number, exclude: string[]): Promise<string[]> {
    if (ids.length >= limit) return ids;
    const have = [...new Set([...ids, ...exclude])];
    const extra = await this.prisma.course.findMany({
      where: { deletedAt: null, ...(have.length ? { id: { notIn: have } } : {}) },
      orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
      take: limit - ids.length,
      select: { id: true },
    });
    return [...ids, ...extra.map((r) => r.id)];
  }
}

// -----------------------------------------------------------------
// Pure scoring — no database, so it is easy to reason about and test.
// -----------------------------------------------------------------

function emptyProfile(): Profile {
  return {
    categories: new Map(),
    tags: new Map(),
    lecturers: new Map(),
    levels: new Map(),
    interacted: new Set(),
    maxima: { categories: 0, tags: 0, lecturers: 0, levels: 0 },
  };
}

function toFeature(row: FeatureRow): Feature {
  return {
    id: row.id,
    levelId: row.levelId,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    downloadCount: row.downloadCount,
    publishedAt: row.publishedAt,
    categories: row.categories.map((c) => c.categoryId),
    tags: row.tags.map((t) => t.tag),
    lecturers: row.lecturers.map((l) => l.lecturerId),
  };
}

function addToProfile(profile: Profile, feature: Feature, weight: number): Profile {
  const add = (map: Map<string, number>, keys: string[]) => {
    for (const key of keys) {
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + weight);
    }
  };
  add(profile.categories, feature.categories);
  add(profile.tags, feature.tags);
  add(profile.lecturers, feature.lecturers);
  if (feature.levelId) add(profile.levels, [feature.levelId]);
  return profile;
}

function finishProfile(profile: Profile): Profile {
  profile.maxima = {
    categories: maxPositive(profile.categories),
    tags: maxPositive(profile.tags),
    lecturers: maxPositive(profile.lecturers),
    levels: maxPositive(profile.levels),
  };
  return profile;
}

function maxPositive(map: Map<string, number>): number {
  let max = 0;
  for (const value of map.values()) if (value > max) max = value;
  return max;
}

/** How much of a dimension a course covers, in 0..1, ignoring negative weights. */
function overlap(map: Map<string, number>, keys: string[], max: number): number {
  if (max <= 0 || keys.length === 0) return 0;
  let sum = 0;
  for (const key of keys) sum += Math.max(0, map.get(key) ?? 0);
  return Math.min(1, sum / max);
}

function rank(profile: Profile, rows: FeatureRow[], limit: number): string[] {
  const now = Date.now();
  const maxDownloads = rows.reduce((max, row) => Math.max(max, row.downloadCount), 1);
  const denominator = Math.log1p(maxDownloads);

  const scored = rows.map((row) => {
    const feature = toFeature(row);
    const content =
      SCORE.category * overlap(profile.categories, feature.categories, profile.maxima.categories) +
      SCORE.tag * overlap(profile.tags, feature.tags, profile.maxima.tags) +
      SCORE.lecturer * overlap(profile.lecturers, feature.lecturers, profile.maxima.lecturers) +
      SCORE.level * overlap(profile.levels, feature.levelId ? [feature.levelId] : [], profile.maxima.levels);

    // Priors only choose between courses that are already relevant. They must
    // not drag an unrelated bestseller onto a "More like this" rail, so they
    // are additive and smaller than one shared category.
    const quality = SCORE.quality * Math.min(1, Math.max(0, feature.ratingAvg) / 5);
    const popularity = SCORE.popularity * (denominator > 0 ? Math.log1p(feature.downloadCount) / denominator : 0);
    const ageDays = Math.max(0, (now - feature.publishedAt.getTime()) / DAY_MS);
    const freshness = SCORE.freshness * Math.max(0, 1 - ageDays / FRESH_DAYS);

    return { id: row.id, score: content + quality + popularity + freshness };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.id);
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.min(Math.max(Math.trunc(value), 1), 24);
}
