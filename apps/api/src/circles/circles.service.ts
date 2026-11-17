import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** A wall post that is only a link with no words is noise; 2000 chars is a long note. */
const POST_MAX = 2000;

@Injectable()
export class CirclesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All circles with member counts + whether the current user has joined. */
  async list(userId?: string) {
    const circles = await this.prisma.circle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { name: true, avatarUrl: true, username: true } },
        _count: { select: { members: true, posts: true } },
      },
    });
    const myMemberships = userId
      ? new Set((await this.prisma.circleMember.findMany({ where: { userId } })).map((m) => m.circleId))
      : new Set<string>();
    return circles.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      owner: c.owner,
      memberCount: c._count.members,
      postCount: c._count.posts,
      joined: myMemberships.has(c.id),
      isOwner: !!userId && c.ownerId === userId,
      createdAt: c.createdAt,
    }));
  }

  async create(userId: string, name: string, description?: string) {
    if (!name.trim()) throw new BadRequestException('Circle name is required');
    const circle = await this.prisma.circle.create({
      data: { name: name.trim(), description: description?.trim() || null, ownerId: userId },
    });
    await this.prisma.circleMember.create({
      data: { circleId: circle.id, userId, role: 'owner' },
    });
    return this.detail(circle.id, userId);
  }

  async join(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    const existing = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!existing) {
      await this.prisma.circleMember.create({ data: { circleId, userId } });
    }
    return { joined: true };
  }

  async leave(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    // Leaving your own circle would strand it: the owner row is gone but the
    // circle keeps their id, so nobody can ever edit or delete it again.
    if (circle.ownerId === userId) {
      throw new BadRequestException('You own this circle — delete it instead of leaving.');
    }
    await this.prisma.circleMember.deleteMany({ where: { circleId, userId } });
    return { left: true };
  }

  /** Owner-only rename/re-describe. */
  async update(userId: string, circleId: string, data: { name?: string; description?: string | null }) {
    await this.assertOwner(userId, circleId);
    const name = data.name?.trim();
    if (data.name !== undefined && !name) throw new BadRequestException('Circle name is required');
    await this.prisma.circle.update({
      where: { id: circleId },
      data: {
        ...(name ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      },
    });
    return this.detail(circleId, userId);
  }

  async remove(userId: string, circleId: string) {
    await this.assertOwner(userId, circleId);
    await this.prisma.circle.delete({ where: { id: circleId } });
    return { deleted: true };
  }

  /** Post to the circle wall, optionally recommending a course. Members only. */
  async createPost(userId: string, circleId: string, body: string, courseId?: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Write something first');
    if (text.length > POST_MAX) throw new BadRequestException(`Keep it under ${POST_MAX} characters`);
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!member) throw new ForbiddenException('Join this circle to post in it');
    if (courseId) {
      const course = await this.prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
      if (!course) throw new BadRequestException('That course no longer exists');
    }
    await this.prisma.circlePost.create({
      data: { circleId, userId, body: text, courseId: courseId ?? null },
    });
    return this.detail(circleId, userId);
  }

  /** Authors delete their own posts; the owner can clear anything on their wall. */
  async deletePost(userId: string, circleId: string, postId: string) {
    const post = await this.prisma.circlePost.findUnique({
      where: { id: postId },
      include: { circle: { select: { ownerId: true, id: true } } },
    });
    if (!post || post.circleId !== circleId) throw new NotFoundException('Post not found');
    if (post.userId !== userId && post.circle.ownerId !== userId) {
      throw new ForbiddenException('You cannot delete that post');
    }
    await this.prisma.circlePost.delete({ where: { id: postId } });
    return this.detail(circleId, userId);
  }

  /** Owner removes a member. The owner's own row is what keeps the circle editable. */
  async removeMember(userId: string, circleId: string, memberId: string) {
    const circle = await this.assertOwner(userId, circleId);
    if (memberId === circle.ownerId) throw new BadRequestException('The owner cannot be removed');
    await this.prisma.circleMember.deleteMany({ where: { circleId, userId: memberId } });
    return this.detail(circleId, userId);
  }

  private async assertOwner(userId: string, circleId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('Circle not found');
    if (circle.ownerId !== userId) throw new ForbiddenException('Only the circle owner can do that');
    return circle;
  }

  /** Circle detail: members, the wall, and recent activity from members. */
  async detail(circleId: string, userId?: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, username: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true, username: true } } },
        },
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, username: true } },
            course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
          },
        },
        // Counted separately so the wall heading stays honest past the 50 we send.
        _count: { select: { posts: true } },
      },
    });
    if (!circle) throw new NotFoundException('Circle not found');

    const memberIds = circle.members.map((m) => m.userId);
    const joined = !!userId && circle.members.some((m) => m.userId === userId);
    // Circle pages are public, so a "friends only" activity item can only be
    // shown once we know the viewer is actually a friend. Followers and people
    // who share this circle are the two definitions used everywhere else.
    const friendIds = new Set<string>();
    if (userId) {
      friendIds.add(userId);
      const follows = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
      });
      for (const f of follows) friendIds.add(f.followeeId);
      if (joined) memberIds.forEach((id) => friendIds.add(id));
    }

    const [reviews, downloads] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId: { in: memberIds }, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true, privacy: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
      this.prisma.downloadEvent.findMany({
        where: { userId: { in: memberIds }, course: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        distinct: ['userId', 'courseId'],
        take: 15,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true, privacy: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
    ]);

    const activity = [
      ...reviews
        .filter((r) => this.canSeeActivity(r.userId, r.user.privacy, 'reviews', friendIds))
        .map((r) => ({
          type: 'review' as const,
          id: r.id,
          userName: r.user.name,
          userAvatar: r.user.avatarUrl,
          username: r.user.username,
          course: r.course,
          body: r.body.slice(0, 160),
          createdAt: r.createdAt,
        })),
      ...downloads
        .filter((d) => d.user && this.canSeeActivity(d.userId, d.user.privacy, 'downloadHistory', friendIds))
        .map((d) => ({
          type: 'download' as const,
          id: d.id,
          userName: d.user!.name,
          userAvatar: d.user!.avatarUrl,
          username: d.user!.username,
          course: d.course,
          createdAt: d.createdAt,
        })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const myId = userId;
    return {
      id: circle.id,
      name: circle.name,
      description: circle.description,
      owner: circle.owner,
      memberCount: circle.members.length,
      postCount: circle._count.posts,
      joined,
      isOwner: !!userId && circle.ownerId === myId,
      /** The client shows the composer off this rather than re-deriving the rule. */
      canPost: joined,
      createdAt: circle.createdAt,
      members: circle.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        username: m.user.username,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      posts: circle.posts.map((p) => ({
        id: p.id,
        body: p.body,
        createdAt: p.createdAt,
        author: {
          id: p.user.id,
          name: p.user.name,
          avatarUrl: p.user.avatarUrl,
          username: p.user.username,
        },
        course: p.course,
        /** Author or owner — computed here so neither client has to know the rule. */
        canDelete: !!userId && (p.userId === myId || circle.ownerId === myId),
      })),
      activity,
    };
  }

  /** Global activity feed — reviews + downloads from people I follow and my circle members. */
  async feed(userId: string) {
    const [following, memberships] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
      this.prisma.circleMember.findMany({ where: { userId }, select: { circleId: true } }),
    ]);
    const circleMembers = await this.prisma.circleMember.findMany({
      where: { circleId: { in: memberships.map((m) => m.circleId) } },
      select: { userId: true },
    });
    const ids = new Set<string>([...following.map((f) => f.followeeId), ...circleMembers.map((m) => m.userId)]);
    ids.delete(userId);
    // Everyone in this feed is a follower or a circle mate, so "friends" is
    // the baseline audience; only "nobody" items need filtering out.
    const friendIds = new Set<string>(ids);
    friendIds.add(userId);

    const [reviews, downloads] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId: { in: [...ids] }, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true, privacy: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
      this.prisma.downloadEvent.findMany({
        where: { userId: { in: [...ids] }, course: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        distinct: ['userId', 'courseId'],
        take: 25,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true, privacy: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
    ]);

    const items = [
      ...reviews
        .filter((r) => this.canSeeActivity(r.userId, r.user.privacy, 'reviews', friendIds))
        .map((r) => ({
          type: 'review' as const,
          id: r.id,
          userName: r.user.name,
          userAvatar: r.user.avatarUrl,
          username: r.user.username,
          course: r.course,
          body: r.body.slice(0, 200),
          createdAt: r.createdAt,
        })),
      ...downloads
        .filter((d) => d.user && this.canSeeActivity(d.userId, d.user.privacy, 'downloadHistory', friendIds))
        .map((d) => ({
          type: 'download' as const,
          id: d.id,
          userName: d.user!.name,
          userAvatar: d.user!.avatarUrl,
          username: d.user!.username,
          course: d.course,
          createdAt: d.createdAt,
        })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { followingCount: following.length, items: items.slice(0, 30) };
  }

  /**
   * Whether one member's activity belongs in a listing this viewer can see.
   *
   * `everyone` is always visible, `nobody` never is, and `friends` requires the
   * viewer to be that person, follow them, or share a circle with them. Circle
   * pages are public, so this is what stops an anonymous visitor from reading
   * a member's friends-only download history.
   */
  private canSeeActivity(authorId: string | null, privacy: unknown, key: string, friendIds: Set<string>): boolean {
    // Download rows can exist without a user (anonymous delivery); there is no
    // privacy setting to honour and no person to name, so leave them off.
    if (!authorId) return false;
    const audience = ((privacy ?? {}) as Record<string, string>)[key] ?? 'everyone';
    if (audience === 'everyone') return true;
    if (audience === 'nobody') return false;
    return friendIds.has(authorId);
  }
}
