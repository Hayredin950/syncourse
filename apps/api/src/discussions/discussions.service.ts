import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DiscussionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Threads for a course — top-level reviews with nested replies + upvote state. */
  async threads(courseIdOrSlug: string, userId?: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');

    const [rows, myUpvotes] = await Promise.all([
      this.prisma.review.findMany({
        where: { courseId: course.id, parentId: null },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { name: true, avatarUrl: true, isStaff: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { name: true, avatarUrl: true, isStaff: true } } },
          },
        },
      }),
      userId
        ? this.prisma.reviewUpvote.findMany({
            where: { userId, review: { courseId: course.id } },
          })
        : Promise.resolve([]),
    ]);

    const upvoted = new Set(myUpvotes.map((u) => u.reviewId));
    const map = (r: any, depth: number) => ({
      id: r.id,
      userName: r.user.name,
      userAvatar: r.user.avatarUrl,
      isStaff: r.user.isStaff,
      body: r.body,
      containsSpoilers: r.containsSpoilers,
      upvotes: r.upvotes,
      upvoted: upvoted.has(r.id),
      replyCount: (r.replies ?? []).length,
      createdAt: r.createdAt,
      depth,
      replies: depth === 0 ? (r.replies ?? []).map((rep: any) => map(rep, 1)) : undefined,
    });

    return {
      courseId: course.id,
      total: rows.length,
      threads: rows.map((r) => map(r, 0)),
    };
  }

  /** Start a new thread or reply to an existing one. */
  async post(userId: string, courseIdOrSlug: string, body: string, parentId?: string) {
    if (!body.trim()) throw new ForbiddenException('Message cannot be empty');
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');

    let parent: { id: string } | null = null;
    if (parentId) {
      parent = await this.prisma.review.findFirst({
        where: { id: parentId, courseId: course.id },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Parent thread not found');
    }

    const review = await this.prisma.review.create({
      data: {
        userId,
        courseId: course.id,
        body: body.trim(),
        containsSpoilers: false,
        parentId: parent?.id ?? null,
      },
      include: { user: { select: { name: true, avatarUrl: true, isStaff: true } } },
    });
    return {
      id: review.id,
      userName: review.user.name,
      userAvatar: review.user.avatarUrl,
      isStaff: review.user.isStaff,
      body: review.body,
      containsSpoilers: review.containsSpoilers,
      upvotes: 0,
      upvoted: false,
      replyCount: 0,
      createdAt: review.createdAt,
      depth: parent ? 1 : 0,
      replies: undefined,
    };
  }

  /** Toggle an upvote on a thread/reply. */
  async toggleUpvote(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Thread not found');

    const existing = await this.prisma.reviewUpvote.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });
    if (existing) {
      await this.prisma.reviewUpvote.delete({ where: { userId_reviewId: { userId, reviewId } } });
      const updated = await this.prisma.review.update({
        where: { id: reviewId },
        data: { upvotes: { decrement: 1 } },
        select: { upvotes: true },
      });
      return { upvoted: false, upvotes: Math.max(0, updated.upvotes) };
    }
    await this.prisma.reviewUpvote.create({ data: { userId, reviewId } });
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { upvotes: { increment: 1 } },
      select: { upvotes: true },
    });
    return { upvoted: true, upvotes: updated.upvotes };
  }

  private async findCourse(idOrSlug: string) {
    return this.prisma.course.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      select: { id: true },
    });
  }
}
