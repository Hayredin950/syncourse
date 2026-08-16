import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Profile page — mirrors the reference stat grid (Enrolled/Completed/Saved/Liked/Lists/Reviews). */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [enrolled, completed, saved, liked, lists, reviews, sessions] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.enrollment.count({ where: { userId, status: 'completed' } }),
      this.prisma.savedCourse.count({ where: { userId } }),
      this.prisma.likedCourse.count({ where: { userId } }),
      this.prisma.collectionList.count({ where: { userId } }),
      this.prisma.review.count({ where: { userId, parentId: null } }),
      this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      gender: user.gender,
      isVerified: user.isVerified,
      isStaff: user.isStaff,
      planType: user.planType,
      planExpiresAt: user.planExpiresAt,
      telegramUsername: user.telegramUsername,
      memberSince: user.createdAt,
      stats: { enrolled, completed, saved, liked, lists, reviews },
      sessions: sessions.map((s) => ({
        id: s.id,
        device: s.device,
        ip: s.ip,
        active: s.active,
        createdAt: s.createdAt,
      })),
    };
  }

  async updateProfile(userId: string, data: { name?: string; gender?: string; avatarUrl?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.gender ? { gender: data.gender } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      },
    });
    return { id: user.id, name: user.name, gender: user.gender, avatarUrl: user.avatarUrl };
  }

  async terminateSession(userId: string, sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { active: false },
    });
    return { terminated: true };
  }

  async terminateAllSessions(userId: string) {
    await this.prisma.session.updateMany({ where: { userId }, data: { active: false } });
    return { terminated: true };
  }
}
