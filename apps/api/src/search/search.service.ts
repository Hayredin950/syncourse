import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Global search — mirrors the reference: type scope, live results, trending chips. */
  async search(q: string, opts: { limit?: number; offset?: number } = {}) {
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
    if (query.length >= 3) {
      await this.upsertTrending(query);
    }

    // Postgres `LIKE` is case-sensitive; without `mode: 'insensitive'` a search
    // for "react" missed "React", "REACT" and every mixed-case title.
    const insensitive = { contains: query, mode: 'insensitive' as const };
    const courseWhere: Prisma.CourseWhereInput = query
      ? {
          deletedAt: null,
          OR: [
            { title: insensitive },
            { description: insensitive },
            { tags: { some: { tag: insensitive } } },
            { categories: { some: { category: { name: insensitive } } } },
            { lecturers: { some: { lecturer: { name: insensitive } } } },
          ],
        }
      : { deletedAt: null };

    const [courses, total, lecturers, organizations, trending] = await Promise.all([
      this.prisma.course.findMany({
        where: courseWhere,
        orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
        take: limit,
        skip: offset,
        include: {
          level: true,
          // Every teacher, in credited order — a course can be taught by several.
          lecturers: { include: { lecturer: true }, orderBy: { orderIndex: 'asc' } },
          organization: true,
          categories: { include: { category: true } },
          tags: true,
          audience: true,
          sections: { include: { lessons: true } },
        },
      }),
      this.prisma.course.count({ where: courseWhere }),
      query
        ? this.prisma.lecturer.findMany({ where: { name: insensitive }, take: 6 })
        : [],
      query
        ? this.prisma.organization.findMany({ where: { name: insensitive }, take: 6 })
        : [],
      this.prisma.trendingQuery.findMany({ orderBy: { count: 'desc' }, take: 10 }),
    ]);

    return {
      query,
      // The real match count. This used to be `courses.length`, so the UI
      // reported the page size ("Courses 20") as if it were the total.
      total,
      limit,
      offset,
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        description: c.description,
        thumbnailUrl: c.thumbnailUrl,
        level: c.level?.name ?? 'All Levels',
        ratingAvg: c.ratingAvg,
        ratingCount: c.ratingCount,
        downloadCount: c.downloadCount,
        durationMin: c.sections.reduce((s, sec) => s + sec.lessons.reduce((x, l) => x + l.durationSec, 0) / 60, 0),
        lessonCount: c.sections.reduce((s, sec) => s + sec.lessons.length, 0),
        lecturerName: c.lecturers[0]?.lecturer.name ?? null,
        lecturerNames: c.lecturers.map((cl) => cl.lecturer.name),
        organizationName: c.organization?.name ?? null,
        categoryNames: c.categories.map((cc) => cc.category?.name ?? '').filter(Boolean),
        isPremium: c.isPremium,
        publishedAt: c.publishedAt,
      })),
      lecturers: lecturers.map((l) => ({ id: l.id, name: l.name, slug: l.slug, photoUrl: l.photoUrl })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug, logoUrl: o.logoUrl })),
      trending: trending.map((t) => t.query),
    };
  }

  /** "Everyone searching" chips — before the user types anything. */
  async trending() {
    const rows = await this.prisma.trendingQuery.findMany({ orderBy: { count: 'desc' }, take: 12 });
    return { trending: rows.map((r) => r.query) };
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
