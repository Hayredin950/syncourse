import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Global search — mirrors the reference: type scope, live results, trending chips. */
  async search(q: string, opts: { limit?: number } = {}) {
    const query = (q || '').trim();
    const limit = Math.min(opts.limit ?? 20, 50);

    if (query) {
      await this.upsertTrending(query);
    }

    const courseWhere: Prisma.CourseWhereInput = query
      ? {
          deletedAt: null,
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { tags: { some: { tag: { contains: query } } } },
          ],
        }
      : { deletedAt: null };

    const [courses, lecturers, organizations, trending] = await Promise.all([
      this.prisma.course.findMany({
        where: courseWhere,
        orderBy: [{ ratingAvg: 'desc' }, { downloadCount: 'desc' }],
        take: limit,
        include: {
          level: true,
          lecturer: true,
          organization: true,
          categories: { include: { category: true } },
          tags: true,
          audience: true,
          sections: { include: { lessons: true } },
        },
      }),
      query
        ? this.prisma.lecturer.findMany({ where: { name: { contains: query } }, take: 6 })
        : [],
      query
        ? this.prisma.organization.findMany({ where: { name: { contains: query } }, take: 6 })
        : [],
      this.prisma.trendingQuery.findMany({ orderBy: { count: 'desc' }, take: 10 }),
    ]);

    return {
      query,
      total: courses.length,
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
        lecturerName: c.lecturer?.name ?? null,
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
