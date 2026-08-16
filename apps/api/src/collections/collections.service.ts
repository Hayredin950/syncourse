import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createList(userId: string, name: string, description: string | undefined, visibility: 'public' | 'private') {
    if (!name.trim()) throw new BadRequestException('List name is required');
    const list = await this.prisma.collectionList.create({
      data: { userId, name, description: description ?? null, visibility },
    });
    return this.withMeta(list);
  }

  async myLists(userId: string) {
    const lists = await this.prisma.collectionList.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { items: { include: { course: true } } },
    });
    return lists.map((l) => this.withMeta(l));
  }

  async getList(id: string, userId?: string) {
    const list = await this.prisma.collectionList.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, username: true } },
        items: { include: { course: { include: { level: true } } }, orderBy: { addedAt: 'desc' } },
        savedBy: true,
      },
    });
    if (!list) throw new NotFoundException('List not found');
    if (list.visibility === 'private' && list.userId !== userId) {
      throw new NotFoundException('List not found');
    }
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      visibility: list.visibility,
      savesCount: list.savedBy.length,
      itemCount: list.items.length,
      ownerName: list.user.name,
      createdAt: list.createdAt,
      items: list.items.map((i) => ({
        id: i.course.id,
        title: i.course.title,
        slug: i.course.slug,
        thumbnailUrl: i.course.thumbnailUrl,
        ratingAvg: i.course.ratingAvg,
        ratingCount: i.course.ratingCount,
        level: i.course.level?.name ?? 'All Levels',
        addedAt: i.addedAt,
      })),
    };
  }

  async addItem(userId: string, listId: string, courseId: string) {
    const list = await this.prisma.collectionList.findUnique({ where: { id: listId } });
    if (!list || list.userId !== userId) throw new NotFoundException('List not found');
    const existing = await this.prisma.collectionItem.findUnique({
      where: { listId_courseId: { listId, courseId } },
    });
    if (!existing) {
      await this.prisma.collectionItem.create({ data: { listId, courseId } });
    }
    return this.getList(listId, userId);
  }

  async removeItem(userId: string, listId: string, courseId: string) {
    const list = await this.prisma.collectionList.findUnique({ where: { id: listId } });
    if (!list || list.userId !== userId) throw new NotFoundException('List not found');
    await this.prisma.collectionItem.deleteMany({ where: { listId, courseId } });
    return this.getList(listId, userId);
  }

  async deleteList(userId: string, listId: string) {
    const list = await this.prisma.collectionList.findUnique({ where: { id: listId } });
    if (!list || list.userId !== userId) throw new NotFoundException('List not found');
    await this.prisma.collectionList.delete({ where: { id: listId } });
    return { deleted: true };
  }

  async saveList(userId: string, listId: string) {
    const list = await this.prisma.collectionList.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException('List not found');
    const existing = await this.prisma.savedList.findUnique({
      where: { userId_listId: { userId, listId } },
    });
    if (existing) {
      await this.prisma.savedList.delete({ where: { userId_listId: { userId, listId } } });
      await this.prisma.collectionList.update({ where: { id: listId }, data: { savesCount: { decrement: 1 } } });
      return { saved: false };
    }
    await this.prisma.savedList.create({ data: { userId, listId } });
    await this.prisma.collectionList.update({ where: { id: listId }, data: { savesCount: { increment: 1 } } });
    return { saved: true };
  }

  /** Public list browser — mirrors the reference: type filter, search lists or creators, sort. */
  async browseLists(filters: { q?: string; sort?: string; limit?: number; offset?: number }) {
    const where: any = { visibility: 'public' };
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q } },
        { user: { name: { contains: filters.q } } },
        { user: { username: { contains: filters.q } } },
      ];
    }
    const orderBy =
      filters.sort === 'most-saved'
        ? [{ savesCount: 'desc' as const }]
        : filters.sort === 'newest'
          ? [{ createdAt: 'desc' as const }]
          : [{ updatedAt: 'desc' as const }];
    const [total, lists] = await Promise.all([
      this.prisma.collectionList.count({ where }),
      this.prisma.collectionList.findMany({
        where,
        orderBy,
        take: Math.min(filters.limit ?? 30, 100),
        skip: filters.offset ?? 0,
        include: {
          user: { select: { name: true, username: true } },
          items: { include: { course: true } },
        },
      }),
    ]);
    return { total, results: lists.map((l) => this.withMeta(l)) };
  }

  private withMeta(list: any) {
    const items = list.items ?? [];
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      visibility: list.visibility,
      savesCount: list.savesCount,
      itemCount: items.length,
      ownerName: list.user?.name ?? null,
      ownerUsername: list.user?.username ?? null,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      covers: items.slice(0, 5).map((i: any) => i.course?.thumbnailUrl).filter(Boolean),
      watchedCount: 0, // computed per-user in the web client
    };
  }
}
