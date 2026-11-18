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

    // The vote row and the denormalised counter used to be two separate
    // statements, so a failure between them drifted `upvotes` away from the
    // real tally. Both now happen in one transaction, and a lost race (the
    // unique row already exists / was just removed) reports the actual state
    // instead of double-counting.
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reviewUpvote.findUnique({
        where: { userId_reviewId: { userId, reviewId } },
      });
      if (existing) {
        const removed = await tx.reviewUpvote.deleteMany({ where: { userId, reviewId } });
        if (removed.count === 0) return null;
        const updated = await tx.review.update({
          where: { id: reviewId },
          data: { upvotes: { decrement: 1 } },
          select: { upvotes: true },
        });
        return { upvoted: false, upvotes: Math.max(0, updated.upvotes) };
      }
      const created = await tx.reviewUpvote.createMany({
        data: [{ userId, reviewId }],
        skipDuplicates: true,
      });
      if (created.count === 0) return null;
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: { upvotes: { increment: 1 } },
        select: { upvotes: true },
      });
      return { upvoted: true, upvotes: updated.upvotes };
    });

    if (result) return result;

    // Another request toggled at the same moment; answer with what is stored
    // now so the client can reconcile instead of flipping a wrong count.
    const [current, mine] = await Promise.all([
      this.prisma.review.findUnique({ where: { id: reviewId }, select: { upvotes: true } }),
      this.prisma.reviewUpvote.findUnique({
        where: { userId_reviewId: { userId, reviewId } },
        select: { userId: true },
      }),
    ]);
    return { upvoted: Boolean(mine), upvotes: Math.max(0, current?.upvotes ?? 0) };
  }

  private async findCourse(idOrSlug: string) {
    return this.prisma.course.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      select: { id: true },
    });
  }
}
