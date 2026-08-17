import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CirclesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All circles with member counts + whether the current user has joined. */
  async list(userId?: string) {
    const circles = await this.prisma.circle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { name: true, avatarUrl: true, username: true } },
        _count: { select: { members: true } },
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
      joined: myMemberships.has(c.id),
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
    await this.prisma.circleMember.deleteMany({ where: { circleId, userId } });
    return { left: true };
  }

  /** Circle detail: members + recent activity from members. */
  async detail(circleId: string, userId?: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, username: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true, username: true } } },
        },
      },
    });
    if (!circle) throw new NotFoundException('Circle not found');

    const memberIds = circle.members.map((m) => m.userId);
    const [reviews, enrollments] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId: { in: memberIds }, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId: { in: memberIds } },
        orderBy: { enrolledAt: 'desc' },
        take: 15,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
    ]);

    const activity = [
      ...reviews.map((r) => ({
        type: 'review' as const,
        id: r.id,
        userName: r.user.name,
        userAvatar: r.user.avatarUrl,
        username: r.user.username,
        course: r.course,
        body: r.body.slice(0, 160),
        createdAt: r.createdAt,
      })),
      ...enrollments.map((e) => ({
        type: 'enrollment' as const,
        id: e.id,
        userName: e.user.name,
        userAvatar: e.user.avatarUrl,
        username: e.user.username,
        course: e.course,
        createdAt: e.enrolledAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const myId = userId;
    return {
      id: circle.id,
      name: circle.name,
      description: circle.description,
      owner: circle.owner,
      memberCount: circle.members.length,
      joined: !!userId && circle.members.some((m) => m.userId === myId),
      members: circle.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        username: m.user.username,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      activity,
    };
  }

  /** Global activity feed — reviews + enrollments from people I follow and my circle members. */
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

    const [reviews, enrollments] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId: { in: [...ids] }, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId: { in: [...ids] } },
        orderBy: { enrolledAt: 'desc' },
        take: 25,
        include: {
          user: { select: { name: true, avatarUrl: true, username: true } },
          course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        },
      }),
    ]);

    const items = [
      ...reviews.map((r) => ({
        type: 'review' as const,
        id: r.id,
        userName: r.user.name,
        userAvatar: r.user.avatarUrl,
        username: r.user.username,
        course: r.course,
        body: r.body.slice(0, 200),
        createdAt: r.createdAt,
      })),
      ...enrollments.map((e) => ({
        type: 'enrollment' as const,
        id: e.id,
        userName: e.user.name,
        userAvatar: e.user.avatarUrl,
        username: e.user.username,
        course: e.course,
        createdAt: e.enrolledAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { followingCount: following.length, items: items.slice(0, 30) };
  }
}
