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
        user: { select: { id: true, name: true, username: true, avatarUrl: true } },
        items: {
          include: {
            course: {
              include: {
                level: true,
                lecturers: {
                  include: { lecturer: { select: { name: true } } },
                  orderBy: { orderIndex: 'asc' },
                },
                // Lesson durations, so a collection renders the same course card
                // as the rest of the site instead of a title over a bare cover.
                lessons: { select: { durationSec: true } },
              },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
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
      ownerUsername: list.user.username,
      ownerAvatarUrl: list.user.avatarUrl,
      /** Drives the owner's edit/add/remove controls without a second request. */
      isOwner: !!userId && list.userId === userId,
      /** The client used to assume `false`, so a list you had saved read "Save list". */
      saved: !!userId && list.savedBy.some((s) => s.userId === userId),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      items: list.items.map((i) => ({
        id: i.course.id,
        title: i.course.title,
        slug: i.course.slug,
        description: i.course.description,
        thumbnailUrl: i.course.thumbnailUrl,
        ratingAvg: i.course.ratingAvg,
        ratingCount: i.course.ratingCount,
        level: i.course.level?.name ?? 'All Levels',
        durationMin: Math.round(i.course.lessons.reduce((s, l) => s + l.durationSec, 0) / 60),
        lessonCount: i.course.lessons.length,
        downloadCount: i.course.downloadCount,
        isPremium: i.course.isPremium,
        contentType: i.course.contentType,
        lecturerNames: i.course.lecturers.map((cl) => cl.lecturer.name),
        addedAt: i.addedAt,
      })),
    };
  }

  /** Rename, re-describe or flip a list between public and private. */
  async updateList(
    userId: string,
    listId: string,
    data: { name?: string; description?: string | null; visibility?: 'public' | 'private' },
  ) {
    await this.assertOwner(userId, listId);
    const name = data.name?.trim();
    if (data.name !== undefined && !name) throw new BadRequestException('List name is required');
    await this.prisma.collectionList.update({
      where: { id: listId },
      data: {
        ...(name ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.visibility ? { visibility: data.visibility } : {}),
      },
    });
    return this.getList(listId, userId);
  }

  async addItem(userId: string, listId: string, courseId: string) {
    await this.assertOwner(userId, listId);
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    const existing = await this.prisma.collectionItem.findUnique({
      where: { listId_courseId: { listId, courseId } },
    });
    if (!existing) {
      await this.prisma.collectionItem.create({ data: { listId, courseId } });
      await this.touch(listId);
    }
    return this.getList(listId, userId);
  }

  /** Add several at once — the picker lets you tick a few before closing it. */
  async addItems(userId: string, listId: string, courseIds: string[]) {
    await this.assertOwner(userId, listId);
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, deletedAt: null },
      select: { id: true },
    });
    if (courses.length) {
      await this.prisma.collectionItem.createMany({
        data: courses.map((c) => ({ listId, courseId: c.id })),
        skipDuplicates: true,
      });
      await this.touch(listId);
    }
    return this.getList(listId, userId);
  }

  async removeItem(userId: string, listId: string, courseId: string) {
    await this.assertOwner(userId, listId);
    const { count } = await this.prisma.collectionItem.deleteMany({ where: { listId, courseId } });
    if (count) await this.touch(listId);
    return this.getList(listId, userId);
  }

  async deleteList(userId: string, listId: string) {
    await this.assertOwner(userId, listId);
    await this.prisma.collectionList.delete({ where: { id: listId } });
    return { deleted: true };
  }

  /**
   * Which of my lists already hold this course. The "Add to list" control on a
   * course page needs both halves in one request, or it opens showing nothing
   * ticked and silently re-adds what is already there.
   */
  async listsForCourse(userId: string, courseId: string) {
    const lists = await this.prisma.collectionList.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        visibility: true,
        _count: { select: { items: true } },
        items: { where: { courseId }, select: { courseId: true } },
      },
    });
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      visibility: l.visibility,
      itemCount: l._count.items,
      contains: l.items.length > 0,
    }));
  }

  private async assertOwner(userId: string, listId: string) {
    const list = await this.prisma.collectionList.findUnique({ where: { id: listId } });
    // Deliberately "not found" rather than "forbidden": a private list should not
    // confirm its own existence to someone who does not own it.
    if (!list || list.userId !== userId) throw new NotFoundException('List not found');
    return list;
  }

  /**
   * `updatedAt` only moves when the list row itself is written, so adding a
   * course used to leave "Last edited" and the default sort stuck at creation.
   */
  private touch(listId: string) {
    return this.prisma.collectionList.update({
      where: { id: listId },
      data: { updatedAt: new Date() },
    });
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
      // Postgres `contains` is case-sensitive without this, so "React" missed "react".
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { user: { name: { contains: filters.q, mode: 'insensitive' } } },
        { user: { username: { contains: filters.q, mode: 'insensitive' } } },
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
          user: { select: { name: true, username: true, avatarUrl: true } },
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
      ownerAvatarUrl: list.user?.avatarUrl ?? null,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      covers: items.slice(0, 5).map((i: any) => i.course?.thumbnailUrl).filter(Boolean),
      watchedCount: 0, // computed per-user in the web client
    };
  }
}
