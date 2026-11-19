import { Injectable, NotFoundException } from '@nestjs/common';
import { Course, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { legalTitle } from '../legal/legal.constants';
import { withPartNumbers } from '../telegram/part-numbering';
import { combineRating } from '../reviews/rating';

type CourseWith = Prisma.CourseGetPayload<{
  include: {
    level: true;
    lecturers: { include: { lecturer: true } };
    organization: true;
    categories: { include: { category: true } };
    tags: true;
    audience: true;
    sections: { include: { lessons: true } };
  };
}>;

/** The catalogue-wide half of the home page. Identical for every visitor. */
type HomeSnapshot = {
  trending: CourseWith[];
  latest: CourseWith[];
  topRated: CourseWith[];
  featuredPaths: Prisma.LearningPathGetPayload<{
    include: { courses: { include: { course: true } } };
  }>[];
  categories: Prisma.CategoryGetPayload<{ include: { courses: true } }>[];
  lecturers: Prisma.LecturerGetPayload<{
    include: { _count: { select: { courseLinks: true } } };
  }>[];
  organizations: Prisma.OrganizationGetPayload<{
    include: { _count: { select: { courses: true } } };
  }>[];
};

const courseInclude = {
  level: true,
  // Ordered, because the order a course credits its teachers in is the order the
  // source post lists them and the order the page should print them.
  lecturers: { include: { lecturer: true }, orderBy: { orderIndex: 'asc' } },
  organization: true,
  categories: { include: { category: true } },
  tags: true,
  audience: true,
  sections: { include: { lessons: true } },
} satisfies Prisma.CourseInclude;

/** The teachers of a course, in credited order. */
function lecturersOf(c: CourseWith) {
  return c.lecturers.map((cl) => cl.lecturer);
}

@Injectable()
export class CatalogService {
  /**
   * The home fan-out is eight catalogue-wide queries. They are identical for
   * every visitor, so one short in-process snapshot serves the burst; only the
   * per-viewer `saved` set is resolved afterwards.
   */
  private homeCache: { at: number; data: HomeSnapshot } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Home rails — mirrors the reference: Trending (Day/Week/Month),
  // Latest (Added badge), Top Rated, Best of {org}, Featured paths,
  // categories, lecturers, organizations.
  // ---------------------------------------------------------------
  async home(userId?: string) {
    const now = new Date();
    const { trending, latest, topRated, featuredPaths, categories, lecturers, organizations } =
      await this.homeSnapshot();

    // Saved is a per-viewer fact; browser cards start in the right state when
    // this list carries it. Trending is the widest set (latest/topRated are
    // subsets in practice), but resolve over all three to be safe.
    const saved = await this.savedSet(userId, [...trending, ...latest, ...topRated]);

    return {
      trending: trending.map((c) => ({ ...this.summary(c, saved), rank: trending.indexOf(c) + 1 })),
      latest: latest.map((c) => ({ ...this.summary(c, saved), isNew: this.isNew(c.publishedAt, now) })),
      topRated: topRated.map((c) => this.summary(c, saved)),
      bestOf: organizations.slice(0, 6).map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        courseCount: org._count.courses,
        courses: trending.filter((c) => c.organizationId === org.id).slice(0, 8).map((c) => this.summary(c, saved)),
      })),
      featuredPaths: featuredPaths.map((p) => {
        const sorted = [...p.courses].sort((a, b) => a.order - b.order);
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          coverUrl: p.coverUrl,
          courseCount: sorted.length,
          ratingAvg: sorted.length
            ? +(sorted.reduce((s, pc) => s + pc.course.ratingAvg, 0) / sorted.length).toFixed(1)
            : 0,
          totalVotes: sorted.reduce((s, pc) => s + pc.course.ratingCount, 0),
          // thumbnail strip for the franchise-style path cards
          courses: sorted.map((pc) => ({
            id: pc.course.id,
            title: pc.course.title,
            slug: pc.course.slug,
            thumbnailUrl: pc.course.thumbnailUrl,
          })),
        };
      }),
      categories: categories
        .filter((cat) => cat.courses.length > 0)
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
          coverImage: cat.coverImage,
          courseCount: cat.courses.length,
        })),
      lecturers: lecturers.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        photoUrl: l.photoUrl,
        credentials: l.credentials,
        courseCount: l._count.courseLinks,
      })),
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logoUrl,
        subscribers: o.subscribers,
        courseCount: o._count.courses,
      })),
    };
  }

  /**
   * One 60-second snapshot of the catalogue rails. Kept deliberately short:
   * long enough to absorb a traffic burst, short enough that an admin publish
   * shows up while the editor is still looking at the page.
   */
  private async homeSnapshot(): Promise<HomeSnapshot> {
    const now = Date.now();
    if (this.homeCache && now - this.homeCache.at < 60_000) return this.homeCache.data;

    const [trending, latest, topRated, featuredPaths, categories, lecturers, organizations] =
      await Promise.all([
        // Trending = raw download volume, tie-broken by rating then recency.
        this.prisma.course.findMany({
          where: { deletedAt: null },
          orderBy: [{ downloadCount: 'desc' }, { ratingAvg: 'desc' }, { publishedAt: 'desc' }],
          take: 20,
          include: courseInclude,
        }),
        this.prisma.course.findMany({
          where: { deletedAt: null },
          orderBy: { publishedAt: 'desc' },
          take: 20,
          include: courseInclude,
        }),
        this.prisma.course.findMany({
          where: { deletedAt: null, ratingCount: { gt: 0 } },
          orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
          take: 20,
          include: courseInclude,
        }),
        this.prisma.learningPath.findMany({
          orderBy: { sortOrder: 'asc' },
          take: 10,
          include: { courses: { include: { course: true } } },
        }),
        this.prisma.category.findMany({
          orderBy: { sortOrder: 'asc' },
          include: { courses: true },
        }),
        this.prisma.lecturer.findMany({
          orderBy: { name: 'asc' },
          take: 12,
          include: { _count: { select: { courseLinks: true } } },
        }),
        this.prisma.organization.findMany({
          orderBy: { subscribers: 'desc' },
          take: 12,
          include: { _count: { select: { courses: true } } },
        }),
      ]);

    const data: HomeSnapshot = { trending, latest, topRated, featuredPaths, categories, lecturers, organizations };
    this.homeCache = { at: now, data };
    return data;
  }

  async categories() {
    const cats = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { courses: true },
    });
    return cats
      .filter((c) => c.courses.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        coverImage: c.coverImage,
        courseCount: c.courses.length,
      }));
  }

  async categoryCourses(slug: string, userId?: string) {
    const cat = await this.prisma.category.findUnique({ where: { slug } });
    if (!cat) throw new NotFoundException('Category not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, categories: { some: { categoryId: cat.id } } },
      orderBy: { publishedAt: 'desc' },
      include: courseInclude,
    });
    const saved = await this.savedSet(userId, courses);
    return { category: cat, courses: courses.map((c) => this.summary(c, saved)) };
  }

  // ---------------------------------------------------------------
  // Browse with filters — mirrors the reference filter panel:
  // category, level, min rating, content type, sort.
  // ---------------------------------------------------------------
  async browse(filters: {
    category?: string;
    level?: string;
    q?: string;
    sort?: string;
    minRating?: number;
    contentType?: string;
    organization?: string;
    lecturer?: string;
    limit?: number;
    offset?: number;
  }, userId?: string) {
    const where: Prisma.CourseWhereInput = { deletedAt: null };
    if (filters.category) {
      where.categories = { some: { category: { slug: filters.category } } };
    }
    if (filters.level) {
      where.level = { name: filters.level };
    }
    if (filters.contentType) {
      where.contentType = filters.contentType;
    }
    if (filters.organization) {
      where.organization = { slug: filters.organization };
    }
    if (filters.lecturer) {
      where.lecturers = { some: { lecturer: { slug: filters.lecturer } } };
    }
    if (filters.q) {
      // Case-insensitive substring match. Postgres `LIKE` is case-sensitive, so
      // "javascript" used to miss "JavaScript" in both browse and search.
      const q = filters.q.trim();
      const insensitive = { contains: q, mode: 'insensitive' as const };
      where.OR = [
        { title: insensitive },
        { description: insensitive },
        { tags: { some: { tag: insensitive } } },
        { categories: { some: { category: { name: insensitive } } } },
        { lecturers: { some: { lecturer: { name: insensitive } } } },
      ];
    }
    if (filters.minRating) {
      where.ratingAvg = { gte: filters.minRating };
    }

    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      filters.sort === 'top-rated'
        ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
        : // 'most-enrolled' is the old name for this sort, still sent by app
          // builds that predate the enrolment removal.
          filters.sort === 'most-downloaded' || filters.sort === 'most-enrolled'
          ? [{ downloadCount: 'desc' }]
          : filters.sort === 'a-z'
            ? [{ title: 'asc' }]
            : [{ publishedAt: 'desc' }];

    const limit = Number.isFinite(filters.limit)
      ? Math.min(Math.max(Math.trunc(filters.limit as number), 1), 100)
      : 30;
    const offset = Number.isFinite(filters.offset)
      ? Math.max(Math.trunc(filters.offset as number), 0)
      : 0;

    // The tab counts deliberately ignore the contentType filter: a count taken
    // under the current selection reads 0 for every tab you are not standing on,
    // which is the opposite of what a tab strip is for.
    const countWhere: Prisma.CourseWhereInput = { ...where };
    delete countWhere.contentType;

    const [total, courses, byType] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({ where, orderBy, take: limit, skip: offset, include: courseInclude }),
      this.prisma.course.groupBy({ by: ['contentType'], where: countWhere, _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = {};
    let all = 0;
    for (const group of byType) {
      counts[group.contentType] = group._count._all;
      all += group._count._all;
    }
    counts.all = all;

    const saved = await this.savedSet(userId, courses);
    return { total, counts, results: courses.map((c) => this.summary(c, saved)) };
  }

  // ---------------------------------------------------------------
  // Course detail — full stack from the spec: banner, meta, actions,
  // sections → lessons → notes → files, ratings, reviews, downloads stats.
  // ---------------------------------------------------------------
  async courseDetail(slug: string, userId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        ...courseInclude,
        sections: { orderBy: { orderIndex: 'asc' }, include: { lessons: { orderBy: { orderIndex: 'asc' } } } },
        telegramFiles: {
          // createdAt breaks ties: rows that predate per-module numbering share
          // partIndex 1, and without it their order — and so the repaired part
          // numbers — would differ between the site and the bot.
          orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }, { createdAt: 'asc' }],
        },
      },    });

    if (!course || course.deletedAt) throw new NotFoundException('Course not found');

    const [ratings, reviewRows, reviewTotal, downloadStats, myUpvotes, reviewRatings, likeCount, mine] = await Promise.all([
      this.prisma.rating.aggregate({ where: { courseId: course.id }, _count: true, _sum: { stars: true } }),
      this.prisma.review.findMany({
        where: { courseId: course.id, parentId: null },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        // Same page size as ReviewsService.listReviews, so "Show all" replaces
        // the preview with an identical first page instead of dropping two rows.
        take: 10,
        include: {
          user: { select: { name: true, avatarUrl: true, isStaff: true } },
          _count: { select: { replies: true } },
          // without this the cards show a "1 reply" counter but no reply text
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { name: true, avatarUrl: true, isStaff: true } } },
          },
        },
      }),
      // The preview above is capped; the page needs the real thread length to
      // offer "Show all" instead of implying twelve is everything.
      this.prisma.review.count({ where: { courseId: course.id, parentId: null } }),
      this.downloadStats(course.id),
      userId
        ? this.prisma.reviewUpvote.findMany({ where: { userId, review: { courseId: course.id } } })
        : Promise.resolve([]),
      // one rating per (user, course) — lets each review card show its author's stars
      this.prisma.rating.findMany({
        where: { courseId: course.id },
        select: { userId: true, stars: true },
      }),
      // The like tally is public: the button shows a number, not just a state.
      this.prisma.likedCourse.count({ where: { courseId: course.id } }),
      // Whether *you* saved / liked / rated it. Signed out, all three are blank —
      // the page renders the same buttons, they just start empty.
      userId
        ? Promise.all([
            this.prisma.savedCourse.findUnique({
              where: { userId_courseId: { userId, courseId: course.id } },
              select: { userId: true },
            }),
            this.prisma.likedCourse.findUnique({
              where: { userId_courseId: { userId, courseId: course.id } },
              select: { userId: true },
            }),
            this.prisma.rating.findUnique({
              where: { userId_courseId: { userId, courseId: course.id } },
              select: { stars: true },
            }),
          ])
        : Promise.resolve([null, null, null] as const),
    ]);
    const upvotedIds = new Set(myUpvotes.map((u) => u.reviewId));
    const ratingByUser = new Map(reviewRatings.map((r) => [r.userId, r.stars]));
    const [savedRow, likedRow, myRatingRow] = mine;

    const ratingDistribution = await this.ratingDistribution(course.id);
    // Source votes + local votes, the same number the button writes back.
    const combinedRating = combineRating({
      baseAvg: course.baseRatingAvg,
      baseCount: course.baseRatingCount,
      localCount: ratings._count,
      localSum: ratings._sum.stars ?? 0,
    });

    const sections = course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      orderIndex: s.orderIndex,
      lessons: s.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        orderIndex: l.orderIndex,
        type: l.type,
        durationSec: l.durationSec,
        isPreview: l.isPreview,
      })),
    }));

    return {
      ...this.summary(course),
      bannerUrl: course.bannerUrl,
      previewVideoUrl: course.previewVideoUrl,
      language: course.language,
      originalPrice: course.originalPrice,
      price: course.price,
      prerequisites: course.prerequisites,
      tags: course.tags.map((t) => t.tag),
      audience: course.audience.map((a) => a.audienceTag),
      lecturer: lecturersOf(course)[0] ?? null,
      lecturers: lecturersOf(course),
      organization: course.organization,
      sections,
      ratings: {
        avg: combinedRating.count > 0 ? +combinedRating.avg.toFixed(1) : 0,
        count: combinedRating.count,
        distribution: ratingDistribution,
      },
      // What this reader has already done to the course, so the buttons can open
      // in the right state instead of claiming nothing is saved or liked.
      saved: !!savedRow,
      liked: !!likedRow,
      likeCount,
      myRating: myRatingRow?.stars ?? 0,
      reviewTotal,
      reviews: reviewRows.map((r) => ({
        id: r.id,
        userName: r.user.name,
        userAvatar: r.user.avatarUrl,
        rating: ratingByUser.get(r.userId) ?? 0,
        body: r.body,
        containsSpoilers: r.containsSpoilers,
        editedAt: r.editedAt,
        createdAt: r.createdAt,
        replyCount: r._count.replies,
        upvotes: r.upvotes,
        upvoted: upvotedIds.has(r.id),
        isStaff: r.user.isStaff,
        // The author gets Edit and Delete; nobody else sees them. Staff can also
        // delete, but the API is the authority on that — this only drives the UI.
        mine: !!userId && r.userId === userId,
        replies: r.replies.map((rep) => ({
          id: rep.id,
          userName: rep.user.name,
          userAvatar: rep.user.avatarUrl,
          isStaff: rep.user.isStaff,
          rating: ratingByUser.get(rep.userId) ?? 0,
          body: rep.body,
          containsSpoilers: rep.containsSpoilers,
          editedAt: rep.editedAt,
          createdAt: rep.createdAt,
          replyCount: 0,
          upvotes: rep.upvotes,
          upvoted: upvotedIds.has(rep.id),
          mine: !!userId && rep.userId === userId,
        })),
      })),
      downloads: downloadStats,
      // Telegram-linked files — the actual course content delivered via Telegram.
      // Part numbers are repaired on the way out so the page agrees with the
      // bot's own buttons; see withPartNumbers for why they can be wrong.
      telegramFiles: withPartNumbers(course.telegramFiles).map((f) => ({
        id: f.id,
        moduleTitle: f.moduleTitle,
        moduleOrder: f.moduleOrder,
        partIndex: f.partIndex,
        fileName: f.fileName,
        fileSizeMb: f.fileSizeMb,
        chatUsername: f.chatUsername,
        caption: f.caption,
      })),
    };
  }

  async lecturers() {
    const rows = await this.prisma.lecturer.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courseLinks: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      photoUrl: l.photoUrl,
      bio: l.bio,
      credentials: l.credentials,
      courseCount: l._count.courseLinks,
    }));
  }

  async lecturerDetail(slug: string, userId?: string) {
    const lecturer = await this.prisma.lecturer.findUnique({ where: { slug } });
    if (!lecturer) throw new NotFoundException('Lecturer not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, lecturers: { some: { lecturerId: lecturer.id } } },
      orderBy: { ratingAvg: 'desc' },
      include: courseInclude,
    });
    let socialLinks: Record<string, string> = {};
    if (lecturer.socialLinks) {
      try {
        socialLinks = JSON.parse(lecturer.socialLinks) as Record<string, string>;
      } catch {
        // Legacy rows can hold malformed JSON; the profile should still load.
        socialLinks = {};
      }
    }
    const saved = await this.savedSet(userId, courses);
    return {
      ...lecturer,
      socialLinks,
      courses: courses.map((c) => this.summary(c, saved)),
    };
  }

  async organizations() {
    const rows = await this.prisma.organization.findMany({
      orderBy: { subscribers: 'desc' },
      include: { _count: { select: { courses: true } } },
    });
    return rows.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      logoUrl: o.logoUrl,
      description: o.description,
      subscribers: o.subscribers,
      courseCount: o._count.courses,
    }));
  }

  async organizationDetail(slug: string, userId?: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) throw new NotFoundException('Organization not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, organizationId: org.id },
      orderBy: { publishedAt: 'desc' },
      include: courseInclude,
    });
    const saved = await this.savedSet(userId, courses);
    return { ...org, courses: courses.map((c) => this.summary(c, saved)) };
  }

  async levels() {
    return this.prisma.level.findMany({ orderBy: { name: 'asc' } });
  }

  async learningPaths() {
    const paths = await this.prisma.learningPath.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { courses: { include: { course: true } } },
    });
    return paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      courseCount: p.courses.length,
      ratingAvg: p.courses.length
        ? +(p.courses.reduce((s, pc) => s + pc.course.ratingAvg, 0) / p.courses.length).toFixed(1)
        : 0,
      totalVotes: p.courses.reduce((s, pc) => s + pc.course.ratingCount, 0),
      courses: p.courses
        .sort((a, b) => a.order - b.order)
        .map((pc) => ({ id: pc.course.id, title: pc.course.title, slug: pc.course.slug, order: pc.order })),
    }));
  }

  /** One learning path with full course summaries (franchise-style detail page). */
  async learningPathDetail(id: string, userId?: string) {
    const p = await this.prisma.learningPath.findUnique({
      where: { id },
      include: { courses: { include: { course: { include: courseInclude } } } },
    });
    if (!p) throw new NotFoundException('Learning path not found');
    const ordered = [...p.courses].sort((a, b) => a.order - b.order);
    const saved = await this.savedSet(userId, ordered.map((pc) => pc.course));
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      courseCount: ordered.length,
      ratingAvg: ordered.length
        ? +(ordered.reduce((s, pc) => s + pc.course.ratingAvg, 0) / ordered.length).toFixed(1)
        : 0,
      totalVotes: ordered.reduce((s, pc) => s + pc.course.ratingCount, 0),
      courses: ordered.map((pc) => this.summary(pc.course, saved)),
    };
  }

  /**
   * Public legal text. Returns the version and edit date alongside the body so a
   * reader can tell whether they are looking at the document they agreed to —
   * the pages render "v1.1 · effective 2 Sep 2026" from these fields.
   */
  async legalDocuments(type?: string) {
    const rows = await this.prisma.legalDocument.findMany({
      where: type ? { type } : undefined,
      orderBy: { type: 'asc' },
    });
    return rows.map((d) => ({
      type: d.type,
      title: legalTitle(d.type, d.title),
      version: d.version,
      bodyMd: d.bodyMd,
      changeSummary: d.changeSummary,
      requiresAcceptance: d.requiresAcceptance,
      effectiveAt: d.effectiveAt,
      updatedAt: d.updatedAt,
    }));
  }

  /** Latest app versions for the in-app update/changelog card. */
  async appVersions(limit = 5) {
    // /app-versions?limit=abc used to hand NaN straight to Prisma.
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 20) : 5;
    const rows = await this.prisma.appVersion.findMany({
      orderBy: { releasedAt: 'desc' },
      take: safeLimit,
    });
    return rows.map((v) => ({
      id: v.id,
      version: v.version,
      changelogMd: v.changelogMd,
      releasedAt: v.releasedAt,
    }));
  }

  /**
   * Cards for a known set of ids, in the order given.
   *
   * Recommendations decide *which* courses belong on a rail; this decides how
   * each one looks. Keeping the card shape here means a new field added to
   * `summary()` appears on every surface at once instead of drifting on the
   * recommendation rails.
   */
  async summariesByIds(ids: string[], userId?: string) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.course.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: courseInclude,
    });
    const byId = new Map(rows.map((c) => [c.id, c]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((c): c is CourseWith => Boolean(c));
    const saved = await this.savedSet(userId, ordered);
    return ordered.map((c) => this.summary(c, saved));
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  private isNew(publishedAt: Date, now: Date) {
    return now.getTime() - publishedAt.getTime() < 30 * 24 * 60 * 60 * 1000;
  }

  private summary(c: CourseWith, saved?: Set<string>) {
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      thumbnailUrl: c.thumbnailUrl,
      level: c.level?.name ?? 'All Levels',
      durationMin: c.sections.reduce((s, sec) => s + sec.lessons.reduce((x, l) => x + l.durationSec, 0) / 60, 0) || 0,
      lessonCount: c.sections.reduce((s, sec) => s + sec.lessons.length, 0),
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
      downloadCount: c.downloadCount,
      isPremium: c.isPremium,
      isFeatured: c.isFeatured,
      contentType: c.contentType,
      categoryNames: c.categories.map((cc) => cc.category?.name ?? '').filter(Boolean),
      // `lecturerName` is the first credit, kept for clients built against the
      // single-lecturer shape; `lecturerNames` is the real answer.
      lecturerName: lecturersOf(c)[0]?.name ?? null,
      lecturerNames: lecturersOf(c).map((l) => l.name),
      organizationName: c.organization?.name ?? null,
      publishedAt: c.publishedAt,
      // Whether the requesting reader already saved it. False for signed-out
      // callers, which is the correct starting state for the save button.
      saved: saved?.has(c.id) ?? false,
    };
  }

  /** Saved-course ids for a viewer across a batch of cards, in one query. */
  private async savedSet(
    userId: string | undefined,
    courses: { id: string }[],
  ): Promise<Set<string> | undefined> {
    if (!userId || courses.length === 0) return undefined;
    const rows = await this.prisma.savedCourse.findMany({
      where: { userId, courseId: { in: [...new Set(courses.map((c) => c.id))] } },
      select: { courseId: true },
    });
    return new Set(rows.map((row) => row.courseId));
  }

  private async downloadStats(courseId: string) {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const [total, last30, last7, today, recent] = await Promise.all([
      this.prisma.downloadEvent.count({ where: { courseId } }),
      this.prisma.downloadEvent.count({ where: { courseId, createdAt: { gte: new Date(now.getTime() - 30 * day) } } }),
      this.prisma.downloadEvent.count({ where: { courseId, createdAt: { gte: new Date(now.getTime() - 7 * day) } } }),
      this.prisma.downloadEvent.count({
        where: { courseId, createdAt: { gte: new Date(now.getTime() - 1 * day) } },
      }),
      this.prisma.downloadEvent.findMany({
        where: { courseId, createdAt: { gte: new Date(now.getTime() - 14 * day) } },
        select: { createdAt: true },
      }),
    ]);

    // 14-day sparkline: downloads per day (oldest → newest)
    const sparkline = new Array(14).fill(0);
    for (const ev of recent) {
      const idx = Math.floor((now.getTime() - ev.createdAt.getTime()) / day);
      if (idx >= 0 && idx < 14) sparkline[13 - idx]++;
    }
    return { total, last30, last7, today, sparkline };
  }

  private async ratingDistribution(courseId: string) {
    const rows = await this.prisma.rating.groupBy({
      by: ['stars'],
      where: { courseId },
      _count: true,
    });
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows) dist[r.stars] = r._count;
    return dist;
  }
}
