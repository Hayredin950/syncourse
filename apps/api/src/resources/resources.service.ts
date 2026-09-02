import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cheat-sheets, roadmaps and notes.
 *
 * These used to be Courses carrying `contentType: 'cheat-sheet'`, which meant a
 * one-image PDF answered with a curriculum, a duration and a lesson count that
 * could never be filled in. They are short enough to publish in full, so the
 * body travels with the row and the clients render all of it.
 */

export const RESOURCE_TYPES = ['cheat-sheet', 'roadmap', 'note'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

const resourceInclude = {
  category: true,
  organization: true,
  lecturer: true,
  tags: true,
  media: { orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.ResourceInclude;

type ResourceWith = Prisma.ResourceGetPayload<{ include: typeof resourceInclude }>;

/** Words per minute for the reading estimate — deliberately slow, these are dense. */
const WPM = 180;

/**
 * Reading time, when the author has not set one. Counting words in the markdown
 * source over-counts link targets and code, so both are dropped first.
 */
export function estimateReadMinutes(bodyMd: string): number {
  const prose = bodyMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|-]/g, ' ');
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WPM));
}

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Card shape — everything a grid tile needs, and no body. */
  private summary(r: ResourceWith) {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      slug: r.slug,
      summary: r.summary,
      coverUrl: r.coverUrl,
      isPremium: r.isPremium,
      isFeatured: r.isFeatured,
      readMinutes: r.readMinutes || estimateReadMinutes(r.bodyMd),
      viewCount: r.viewCount,
      downloadCount: r.downloadCount,
      publishedAt: r.publishedAt,
      category: r.category ? { name: r.category.name, slug: r.category.slug, icon: r.category.icon } : null,
      organization: r.organization ? { name: r.organization.name, slug: r.organization.slug } : null,
      lecturer: r.lecturer ? { name: r.lecturer.name, slug: r.lecturer.slug } : null,
      tags: r.tags.map((t) => t.tag),
      mediaCount: r.media.length,
      // The kinds present drive the "3 images · 1 PDF" line on a card without
      // shipping every attachment to the index.
      mediaKinds: [...new Set(r.media.map((m) => m.kind))],
    };
  }

  private detail(r: ResourceWith) {
    return {
      ...this.summary(r),
      bodyMd: r.bodyMd,
      sourceUrl: r.sourceUrl,
      updatedAt: r.updatedAt,
      media: r.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        url: m.url,
        fileName: m.fileName,
        fileSizeMb: m.fileSizeMb,
        caption: m.caption,
        orderIndex: m.orderIndex,
      })),
    };
  }

  async list(filters: {
    type?: string;
    category?: string;
    organization?: string;
    lecturer?: string;
    tag?: string;
    q?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.ResourceWhereInput = { deletedAt: null };
    if (filters.type && RESOURCE_TYPES.includes(filters.type as ResourceType)) where.type = filters.type;
    if (filters.category) where.category = { slug: filters.category };
    if (filters.organization) where.organization = { slug: filters.organization };
    if (filters.lecturer) where.lecturer = { slug: filters.lecturer };
    if (filters.tag) where.tags = { some: { tag: filters.tag } };
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { summary: { contains: filters.q, mode: 'insensitive' } },
        { bodyMd: { contains: filters.q, mode: 'insensitive' } },
        { tags: { some: { tag: { contains: filters.q, mode: 'insensitive' } } } },
      ];
    }

    const orderBy: Prisma.ResourceOrderByWithRelationInput[] =
      filters.sort === 'popular'
        ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }]
        : filters.sort === 'a-z'
          ? [{ title: 'asc' }]
          : [{ publishedAt: 'desc' }];

    const limit = Math.min(filters.limit ?? 30, 100);
    const offset = filters.offset ?? 0;

    const [total, rows, counts, catGroups] = await Promise.all([
      this.prisma.resource.count({ where }),
      this.prisma.resource.findMany({ where, orderBy, take: limit, skip: offset, include: resourceInclude }),
      // Tab counts are for the whole library, not the filtered slice, so the
      // "Roadmaps 4" chip does not drop to 0 the moment you filter to notes.
      this.prisma.resource.groupBy({ by: ['type'], where: { deletedAt: null }, _count: true }),
      // Same reasoning for the category pills, and it has to come from here
      // rather than GET /categories: that list is course-driven and hides a
      // category whose only content is a cheat-sheet.
      this.prisma.resource.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, categoryId: { not: null } },
        _count: true,
      }),
    ]);

    const catIds = catGroups.map((c) => c.categoryId).filter((id): id is string => !!id);
    const catRows = catIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true, slug: true, icon: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const catCount = new Map(catGroups.map((c) => [c.categoryId, c._count]));

    return {
      total,
      results: rows.map((r) => this.summary(r)),
      counts: Object.fromEntries(counts.map((c) => [c.type, c._count])) as Record<string, number>,
      categories: catRows.map((c) => ({
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        count: catCount.get(c.id) ?? 0,
      })),
    };
  }

  /** Detail plus a short "more like this" rail, so the page is never a dead end. */
  async detailBySlug(slug: string) {
    const row = await this.prisma.resource.findUnique({ where: { slug }, include: resourceInclude });
    if (!row || row.deletedAt) throw new NotFoundException('Resource not found');

    // Fire-and-forget: a failed counter must not fail the read.
    this.prisma.resource
      .update({ where: { id: row.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    const related = await this.prisma.resource.findMany({
      where: {
        deletedAt: null,
        id: { not: row.id },
        OR: [
          row.categoryId ? { categoryId: row.categoryId } : {},
          { type: row.type },
        ].filter((c) => Object.keys(c).length > 0),
      },
      orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
      take: 6,
      include: resourceInclude,
    });

    return { ...this.detail(row), related: related.map((r) => this.summary(r)) };
  }

  /** Counted separately from views so "opened" and "kept" stay distinguishable. */
  async countDownload(slug: string) {
    const row = await this.prisma.resource.findUnique({ where: { slug }, select: { id: true } });
    if (!row) throw new NotFoundException('Resource not found');
    const updated = await this.prisma.resource.update({
      where: { id: row.id },
      data: { downloadCount: { increment: 1 } },
      select: { downloadCount: true },
    });
    return { ok: true, downloadCount: updated.downloadCount };
  }
}
