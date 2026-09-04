import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async rate(userId: string, courseIdOrSlug: string, stars: number) {
    if (stars < 1 || stars > 5) throw new BadRequestException('Rating must be between 1 and 5');
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;

    const existing = await this.prisma.rating.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      await this.prisma.rating.update({
        where: { id: existing.id },
        data: { stars },
      });
    } else {
      await this.prisma.rating.create({ data: { userId, courseId, stars } });
    }

    // denormalize aggregates on the course row (spec B.7 optimization)
    const agg = await this.prisma.rating.aggregate({
      where: { courseId },
      _avg: { stars: true },
      _count: true,
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ratingAvg: agg._avg.stars ? +agg._avg.stars.toFixed(2) : 0,
        ratingCount: agg._count,
      },
    });
    return { rated: true, stars, ratingAvg: +((agg._avg.stars ?? 0)).toFixed(2), ratingCount: agg._count };
  }

  async postReview(userId: string, courseIdOrSlug: string, body: string, containsSpoilers: boolean, parentId?: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;
    if (parentId) {
      const parent = await this.prisma.review.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Parent review not found');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const review = await this.prisma.review.create({
      data: { userId, courseId, body, containsSpoilers, parentId },
    });
    // the client inserts this straight into the rendered list, so return the
    // same shape the course-detail endpoint does — otherwise the new card is
    // missing its stars and the reply body can't be shown until a reload
    const myRating = await this.prisma.rating.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { stars: true },
    });
    return {
      id: review.id,
      userName: user?.name ?? 'Anonymous',
      userAvatar: user?.avatarUrl ?? null,
      isStaff: user?.isStaff ?? false,
      rating: myRating?.stars ?? 0,
      body: review.body,
      containsSpoilers: review.containsSpoilers,
      editedAt: review.editedAt,
      createdAt: review.createdAt,
      replyCount: 0,
      upvotes: review.upvotes,
      upvoted: false,
      // you wrote it, so the card it renders into gets its edit/delete controls
      mine: true,
      replies: [],
    };
  }

  /**
   * Edit a review or a reply. Only the author may change the words — staff can
   * remove something, but rewriting what someone else said under their name is
   * a different power and not one this endpoint grants.
   *
   * `editedAt` is stamped on every save so the card can say "edited": a review
   * that quietly changes after people have replied to it is how a thread stops
   * making sense.
   */
  async editReview(userId: string, reviewId: string, body: string, containsSpoilers?: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('You can only edit your own review');

    const text = body.trim();
    if (!text) throw new BadRequestException('A review needs some text');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        body: text,
        containsSpoilers: containsSpoilers ?? review.containsSpoilers,
        editedAt: new Date(),
      },
    });
    return {
      id: updated.id,
      body: updated.body,
      containsSpoilers: updated.containsSpoilers,
      editedAt: updated.editedAt,
    };
  }

  /**
   * Delete a review or a reply. The author can always remove their own; staff
   * can remove anyone's, which is the moderation path.
   *
   * Replies cascade (`onDelete: Cascade` on the self-relation), so deleting a
   * top-level review takes its thread with it. The reply count is returned so
   * the client knows how many cards vanished rather than guessing.
   *
   * `isStaff` is read from the database, not the token: the JWT payload carries
   * only id/email/username, so a staff claim in it would be nothing but a
   * client's word for it.
   */
  async deleteReview(userId: string, reviewId: string) {
    const [review, actor] = await Promise.all([
      this.prisma.review.findUnique({
        where: { id: reviewId },
        include: { _count: { select: { replies: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { isStaff: true } }),
    ]);
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId && !actor?.isStaff) {
      throw new ForbiddenException('You can only delete your own review');
    }

    await this.prisma.review.delete({ where: { id: reviewId } });
    return { deleted: true, id: reviewId, repliesRemoved: review._count.replies };
  }

  async listReviews(courseIdOrSlug: string, sort: 'top' | 'newest' = 'newest', page = 1) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;
    const take = 10;
    const skip = (page - 1) * take;
    const where = { courseId, parentId: null };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: sort === 'top' ? [{ createdAt: 'desc' }] : [{ createdAt: 'desc' }],
        skip,
        take,
        include: {
          user: { select: { name: true, avatarUrl: true, isStaff: true } },
          _count: { select: { replies: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { name: true, avatarUrl: true, isStaff: true } } },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      total,
      page,
      reviews: rows.map((r) => ({
        id: r.id,
        userName: r.user.name,
        userAvatar: r.user.avatarUrl,
        isStaff: r.user.isStaff,
        body: r.body,
        containsSpoilers: r.containsSpoilers,
        editedAt: r.editedAt,
        createdAt: r.createdAt,
        replyCount: r._count.replies,
        replies: r.replies.map((rep) => ({
          id: rep.id,
          userName: rep.user.name,
          userAvatar: rep.user.avatarUrl,
          isStaff: rep.user.isStaff,
          body: rep.body,
          createdAt: rep.createdAt,
        })),
      })),
    };
  }

  private async findCourse(idOrSlug: string) {
    return this.prisma.course.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
  }
}
