import { Injectable, NotFoundException } from '@nestjs/common';
import { Course, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CourseWith = Prisma.CourseGetPayload<{
  include: {
    level: true;
    lecturer: true;
    organization: true;
    categories: { include: { category: true } };
    tags: true;
    audience: true;
    sections: { include: { lessons: true } };
  };
}>;

const courseInclude = {
  level: true,
  lecturer: true,
  organization: true,
  categories: { include: { category: true } },
  tags: true,
  audience: true,
  sections: { include: { lessons: true } },
} satisfies Prisma.CourseInclude;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Home rails — mirrors the reference: Trending (Day/Week/Month),
  // Latest (Added badge), Top Rated, Best of {org}, Featured paths,
  // categories, lecturers, organizations.
  // ---------------------------------------------------------------
  async home() {
    const now = new Date();
    const [trending, latest, topRated, featuredPaths, categories, lecturers, organizations] =
      await Promise.all([
        // Trending = velocity (recent downloads dominate), NOT the same as most-enrolled.
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
          include: { _count: { select: { courses: true } } },
        }),
        this.prisma.organization.findMany({
          orderBy: { subscribers: 'desc' },
          take: 12,
          include: { _count: { select: { courses: true } } },
        }),
      ]);

    return {
      trending: trending.map((c) => ({ ...this.summary(c), rank: trending.indexOf(c) + 1 })),
      latest: latest.map((c) => ({ ...this.summary(c), isNew: this.isNew(c.publishedAt, now) })),
      topRated: topRated.map((c) => this.summary(c)),
      bestOf: organizations.slice(0, 6).map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        courseCount: org._count.courses,
        courses: trending.filter((c) => c.organizationId === org.id).slice(0, 8).map((c) => this.summary(c)),
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
        courseCount: l._count.courses,
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

  async categoryCourses(slug: string) {
    const cat = await this.prisma.category.findUnique({ where: { slug } });
    if (!cat) throw new NotFoundException('Category not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, categories: { some: { categoryId: cat.id } } },
      orderBy: { publishedAt: 'desc' },
      include: courseInclude,
    });
    return { category: cat, courses: courses.map((c) => this.summary(c)) };
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
  }) {
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
      where.lecturer = { slug: filters.lecturer };
    }
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q } },
        { description: { contains: filters.q } },
        { tags: { some: { tag: { contains: filters.q } } } },
      ];
    }
    if (filters.minRating) {
      where.ratingAvg = { gte: filters.minRating };
    }

    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      filters.sort === 'top-rated'
        ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
        : filters.sort === 'most-enrolled'
          ? [{ enrollmentCount: 'desc' }]
          : filters.sort === 'a-z'
            ? [{ title: 'asc' }]
            : [{ publishedAt: 'desc' }];

    const limit = Math.min(filters.limit ?? 30, 100);
    const offset = filters.offset ?? 0;

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({ where, orderBy, take: limit, skip: offset, include: courseInclude }),
    ]);

    return { total, results: courses.map((c) => this.summary(c)) };
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
      },    });

    if (!course || course.deletedAt) throw new NotFoundException('Course not found');

    const [ratings, reviewRows, downloadStats, myUpvotes, reviewRatings] = await Promise.all([
      this.prisma.rating.aggregate({ where: { courseId: course.id }, _avg: { stars: true }, _count: true }),
      this.prisma.review.findMany({
        where: { courseId: course.id, parentId: null },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        take: 12,
        include: { user: { select: { name: true, avatarUrl: true, isStaff: true } }, _count: { select: { replies: true } } },
      }),
      this.downloadStats(course.id),
      userId
        ? this.prisma.reviewUpvote.findMany({ where: { userId, review: { courseId: course.id } } })
        : Promise.resolve([]),
      // one rating per (user, course) — lets each review card show its author's stars
      this.prisma.rating.findMany({
        where: { courseId: course.id },
        select: { userId: true, stars: true },
      }),
    ]);
    const upvotedIds = new Set(myUpvotes.map((u) => u.reviewId));
    const ratingByUser = new Map(reviewRatings.map((r) => [r.userId, r.stars]));

    const ratingDistribution = await this.ratingDistribution(course.id);

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
      lecturer: course.lecturer,
      organization: course.organization,
      sections,
      ratings: {
        avg: ratings._avg.stars ? +ratings._avg.stars.toFixed(1) : 0,
        count: ratings._count,
        distribution: ratingDistribution,
      },
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
      })),
      downloads: downloadStats,
    };
  }

  async lecturers() {
    const rows = await this.prisma.lecturer.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      photoUrl: l.photoUrl,
      bio: l.bio,
      credentials: l.credentials,
      courseCount: l._count.courses,
    }));
  }

  async lecturerDetail(slug: string) {
    const lecturer = await this.prisma.lecturer.findUnique({ where: { slug } });
    if (!lecturer) throw new NotFoundException('Lecturer not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, lecturerId: lecturer.id },
      orderBy: { ratingAvg: 'desc' },
      include: courseInclude,
    });
    return { ...lecturer, socialLinks: JSON.parse(lecturer.socialLinks || '{}'), courses: courses.map((c) => this.summary(c)) };
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

  async organizationDetail(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) throw new NotFoundException('Organization not found');
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null, organizationId: org.id },
      orderBy: { publishedAt: 'desc' },
      include: courseInclude,
    });
    return { ...org, courses: courses.map((c) => this.summary(c)) };
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

  async legalDocuments(type?: string) {
    const where = type ? { type } : undefined;
    return this.prisma.legalDocument.findMany({
      where,
      select: { type: true, version: true, bodyMd: true, effectiveAt: true },
    });
  }

  /** Latest app versions for the in-app update/changelog card. */
  async appVersions(limit = 5) {
    const rows = await this.prisma.appVersion.findMany({
      orderBy: { releasedAt: 'desc' },
      take: Math.min(limit, 20),
    });
    return rows.map((v) => ({
      id: v.id,
      version: v.version,
      changelogMd: v.changelogMd,
      releasedAt: v.releasedAt,
    }));
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  private isNew(publishedAt: Date, now: Date) {
    return now.getTime() - publishedAt.getTime() < 30 * 24 * 60 * 60 * 1000;
  }

  private summary(c: CourseWith) {
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
      enrollmentCount: c.enrollmentCount,
      downloadCount: c.downloadCount,
      isPremium: c.isPremium,
      isFeatured: c.isFeatured,
      contentType: c.contentType,
      categoryNames: c.categories.map((cc) => cc.category?.name ?? '').filter(Boolean),
      lecturerName: c.lecturer?.name ?? null,
      organizationName: c.organization?.name ?? null,
      publishedAt: c.publishedAt,
    };
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
