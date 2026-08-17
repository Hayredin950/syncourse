import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** shape of a course the user has engaged with (enrolled/saved/liked) */
type EngagedCourse = {
  id: string;
  title: string;
  language: string;
  contentType: string;
  lecturer: { name: string; photoUrl: string | null } | null;
  level: { name: string } | null;
  categories: { category: { name: string } | null }[];
  tags: { tag: string }[];
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Profile page — mirrors the reference stat grid (Enrolled/Completed/Saved/Liked/Lists/Reviews). */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [enrolled, completed, saved, liked, lists, reviews, sessions, pendingSub] = await Promise.all([
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
      this.prisma.subscription.findFirst({
        where: { userId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
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
      settings: user.settings as Record<string, unknown> | null,
      privacy: user.privacy as Record<string, string> | null,
      hasGoogle: !!user.googleId,
      hasPassword: !!user.passwordHash,
      pendingPayment: pendingSub
        ? { id: pendingSub.id, planName: pendingSub.planName, paymentMethod: pendingSub.paymentMethod, amount: pendingSub.amount }
        : null,
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

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      gender?: string;
      avatarUrl?: string;
      settings?: Record<string, unknown>;
      privacy?: Record<string, string>;
    },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.gender ? { gender: data.gender } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.settings !== undefined ? { settings: data.settings as Prisma.InputJsonValue } : {}),
        ...(data.privacy !== undefined ? { privacy: data.privacy as Prisma.InputJsonValue } : {}),
      },
    });
    return {
      id: user.id,
      name: user.name,
      gender: user.gender,
      avatarUrl: user.avatarUrl,
      settings: user.settings as Record<string, unknown> | null,
      privacy: user.privacy as Record<string, string> | null,
    };
  }

  /** Full phonofilm-style stats dashboard for the profile Stats tab. */
  async stats(userId: string) {
    const now = new Date();

    // courses the user has engaged with (enrolled + saved + liked), deduped by course
    const courseInclude = {
      include: {
        categories: { include: { category: true } },
        tags: true,
        level: true,
        lecturer: true,
      },
    } as const;
    const [enrollments, saved, liked, ratings, reviews, downloads, user] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId },
        include: { course: courseInclude },
      }),
      this.prisma.savedCourse.findMany({ where: { userId }, include: { course: courseInclude } }),
      this.prisma.likedCourse.findMany({ where: { userId }, include: { course: courseInclude } }),
      this.prisma.rating.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.review.findMany({ where: { userId, parentId: null }, include: { course: true } }),
      this.prisma.downloadEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');

    // --- dedupe engaged courses (enroll first, then saved, then liked) ---
    const byId = new Map<string, EngagedCourse>();
    for (const e of enrollments) byId.set(e.course.id, e.course);
    for (const s of saved) if (!byId.has(s.course.id)) byId.set(s.course.id, s.course);
    for (const l of liked) if (!byId.has(l.course.id)) byId.set(l.course.id, l.course);
    const engaged = [...byId.values()];

    const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const last12: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      last12.push(monthKey(d));
    }

    // --- monthly completions (learning rhythm) ---
    const monthlyCompleted = last12.map((k) => ({ month: k, count: 0 }));
    const compIdx = new Map(last12.map((k, i) => [k, i]));
    for (const e of enrollments) {
      if (e.status !== 'completed') continue;
      const k = monthKey(e.updatedAt);
      const i = compIdx.get(k);
      if (i !== undefined) monthlyCompleted[i].count++;
    }

    // --- rating distribution (0.5..5) ---
    const ratingDistribution: { stars: number; count: number }[] = [];
    const starCounts = new Map<number, number>();
    for (const r of ratings) starCounts.set(r.stars, (starCounts.get(r.stars) ?? 0) + 1);
    for (let s = 5; s >= 1; s--) ratingDistribution.push({ stars: s, count: starCounts.get(s) ?? 0 });

    // --- ranked bars: categories / instructors / languages ---
    const countBy = <T>(arr: T[], key: (t: T) => string | null) => {
      const m = new Map<string, number>();
      for (const x of arr) {
        const k = key(x);
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    };
    const categoryCounts = countBy(
      engaged.flatMap((c) => c.categories.map((cc) => cc.category?.name ?? null)),
      (x) => x,
    );
    const instructorCounts = countBy(engaged, (c) => c.lecturer?.name ?? null);
    const languageCounts = countBy(engaged, (c) => c.language);

    // --- instructors you learn from most (avatar grid) ---
    const topInstructors = instructorCounts.slice(0, 8).map((row) => {
      const c = engaged.find((x) => x.lecturer?.name === row.label);
      return { name: row.label, count: row.count, photoUrl: c?.lecturer?.photoUrl ?? null };
    });

    // --- content type breakdown ---
    const typeCounts = new Map<string, number>();
    for (const c of engaged) typeCounts.set(c.contentType, (typeCounts.get(c.contentType) ?? 0) + 1);
    const totalTypes = engaged.length || 1;
    const contentTypeBreakdown = [...typeCounts.entries()]
      .map(([label, count]) => ({ label, count, pct: Math.round((count / totalTypes) * 100) }))
      .sort((a, b) => b.count - a.count);

    // --- difficulty breakdown ---
    const diffCounts = new Map<string, number>();
    for (const c of engaged) diffCounts.set(c.level?.name ?? 'Unspecified', (diffCounts.get(c.level?.name ?? 'Unspecified') ?? 0) + 1);
    const totalDiff = engaged.length || 1;
    const difficultyBreakdown = [...diffCounts.entries()]
      .map(([label, count]) => ({ label, count, pct: Math.round((count / totalDiff) * 100) }))
      .sort((a, b) => b.count - a.count);

    // --- your week (activity by weekday) ---
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayCounts = new Array(7).fill(0);
    const bumpDay = (d: Date) => {
      weekdayCounts[d.getUTCDay()]++;
    };
    for (const e of enrollments) bumpDay(e.enrolledAt);
    for (const r of reviews) bumpDay(r.createdAt);
    for (const d of downloads) bumpDay(d.createdAt);
    const yourWeek = weekdays.map((day, i) => ({ day, count: weekdayCounts[i] }));

    // --- watchlist growth (12 months of saved items) ---
    const watchlistGrowth = last12.map((k) => ({ month: k, count: 0 }));
    for (const s of saved) {
      const i = compIdx.get(monthKey(s.createdAt));
      if (i !== undefined) watchlistGrowth[i].count++;
    }

    // --- top tags ---
    const tagCounts = countBy(engaged.flatMap((c) => c.tags.map((t) => t.tag)), (x) => x);
    const topTags = tagCounts.slice(0, 8);

    // --- curated learning-path progress ---
    const pathCourses = await this.prisma.learningPathCourse.findMany({
      where: { courseId: { in: engaged.map((c) => c.id) } },
      include: { path: true },
    });
    const pathIds = [...new Set(pathCourses.map((pc) => pc.pathId))];
    const pathProgress = await Promise.all(
      pathIds.slice(0, 5).map(async (pathId) => {
        const path = await this.prisma.learningPath.findUnique({
          where: { id: pathId },
          include: { courses: true },
        });
        if (!path) return null;
        const total = path.courses.length || 1;
        const enrolled = path.courses.filter((pc) => byId.has(pc.courseId)).length;
        const completed = path.courses.filter((pc) =>
          enrollments.some((e) => e.courseId === pc.courseId && e.status === 'completed'),
        ).length;
        return {
          id: path.id,
          title: path.title,
          coverUrl: path.coverUrl,
          enrolled,
          completed,
          total,
          pct: Math.round((completed / total) * 100),
        };
      }),
    );

    return {
      engagedTotal: engaged.length,
      ratingDistribution,
      monthlyCompleted,
      categoryCounts,
      instructorCounts,
      languageCounts,
      topInstructors,
      contentTypeBreakdown,
      difficultyBreakdown,
      yourWeek,
      watchlistGrowth,
      topTags,
      pathProgress: pathProgress.filter(Boolean),
      // auth/sign-in methods for Settings
      hasGoogle: !!user.googleId,
      hasPassword: !!user.passwordHash,
      emailVerified: user.isVerified,
    };
  }

  async unlinkGoogle(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.googleId) throw new BadRequestException('Google is not linked to this account');
    if (!user.passwordHash) {
      throw new BadRequestException('Set a password first so you can still sign in');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { googleId: null } });
    return { unlinked: true };
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    if (user.passwordHash) {
      if (!currentPassword || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
        throw new BadRequestException('Current password is incorrect');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });
    return { changed: true };
  }

  /** Toggle follow on another user — returns new state. */
  async toggleFollow(followerId: string, followeeId: string) {
    if (followerId === followeeId) throw new BadRequestException('You cannot follow yourself');
    const target = await this.prisma.user.findUnique({ where: { id: followeeId } });
    if (!target) throw new NotFoundException('User not found');
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
    });
    if (existing) {
      await this.prisma.follow.delete({ where: { followerId_followeeId: { followerId, followeeId } } });
      return { following: false };
    }
    await this.prisma.follow.create({ data: { followerId, followeeId } });
    return { following: true };
  }

  async following(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { followee: { select: { id: true, name: true, username: true, avatarUrl: true } } },
    });
    return rows.map((r) => ({ id: r.followee.id, name: r.followee.name, username: r.followee.username, avatarUrl: r.followee.avatarUrl }));
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
