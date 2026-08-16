import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(userId: string, courseIdOrSlug: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course || course.deletedAt) throw new NotFoundException('Course not found');
    const courseId = course.id;

    const existing = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
    if (existing) return { enrolled: true, already: true, enrollment: existing };

    const enrollment = await this.prisma.enrollment.create({
      data: { userId, courseId, status: 'in_progress', progressPct: 0 },
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: { enrollmentCount: { increment: 1 } },
    });
    return { enrolled: true, already: false, enrollment };
  }

  /** Mark a lesson completed → recompute course progress %. */
  async markLessonComplete(userId: string, lessonId: string, completed = true) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: { include: { sections: { include: { lessons: true } } } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const found = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: lesson.courseId },
    });
    let enrollment = found ?? (await this.enroll(userId, lesson.courseId)).enrollment;

    const existing = await this.prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    });
    if (existing) {
      await this.prisma.lessonProgress.update({
        where: { id: existing.id },
        data: { completed, completedAt: completed ? new Date() : null },
      });
    } else {
      await this.prisma.lessonProgress.create({
        data: { enrollmentId: enrollment.id, lessonId, completed, completedAt: completed ? new Date() : null },
      });
    }

    // recompute progress
    const allLessons = lesson.course.sections.flatMap((s) => s.lessons);
    const completedRows = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id, completed: true },
    });
    const completedIds = new Set(completedRows.map((r) => r.lessonId));
    const done = allLessons.filter((l) => completedIds.has(l.id)).length;
    const progressPct = allLessons.length ? Math.round((done / allLessons.length) * 100) : 0;
    const status = progressPct >= 100 ? 'completed' : 'in_progress';

    enrollment = await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { progressPct, status, lastLessonId: lessonId },
    });

    // In-app notification on progress milestones (Telegram reminder sent
    // separately when the bot is configured).
    if (completed && (progressPct === 25 || progressPct === 50 || progressPct === 100)) {
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'progress',
          title: progressPct === 100 ? 'Course completed 🎉' : `${progressPct}% there!`,
          body:
            progressPct === 100
              ? `You finished "${lesson.course.title}". Great work!`
              : `You're ${progressPct}% through "${lesson.course.title}". Keep going!`,
          deepLink: `/courses/${lesson.course.slug}`,
        },
      });
    }

    return { lessonId, completed, progressPct, status };
  }

  async myLearning(userId: string) {
    const [enrollments, saved, liked] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: { course: true, lessonProgress: true },
      }),
      this.prisma.savedCourse.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { course: true },
      }),
      this.prisma.likedCourse.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { course: true },
      }),
    ]);

    const inProgress = enrollments
      .filter((e) => e.status === 'in_progress')
      .map((e) => ({ ...this.flat(e), progressPct: e.progressPct, status: e.status }));
    const completed = enrollments
      .filter((e) => e.status === 'completed')
      .map((e) => ({ ...this.flat(e), progressPct: 100, status: e.status }));

    return {
      inProgress,
      completed,
      watchlist: saved.map((s) => this.flat(s.course as any, { savedAt: s.createdAt })),
      liked: liked.map((l) => this.flat(l.course as any, { likedAt: l.createdAt })),
      counts: {
        inProgress: inProgress.length,
        completed: completed.length,
        watchlist: saved.length,
        liked: liked.length,
      },
    };
  }

  async saveCourse(userId: string, courseIdOrSlug: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;
    const existing = await this.prisma.savedCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      await this.prisma.savedCourse.delete({ where: { userId_courseId: { userId, courseId } } });
      return { saved: false };
    }
    await this.prisma.savedCourse.create({ data: { userId, courseId } });
    return { saved: true };
  }

  async likeCourse(userId: string, courseIdOrSlug: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;
    const existing = await this.prisma.likedCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      await this.prisma.likedCourse.delete({ where: { userId_courseId: { userId, courseId } } });
      return { liked: false };
    }
    await this.prisma.likedCourse.create({ data: { userId, courseId } });
    return { liked: true };
  }

  private async findCourse(idOrSlug: string) {
    return this.prisma.course.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
    });
  }

  private flat(course: any, extra: Record<string, unknown> = {}) {
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      level: course.level?.name ?? 'All Levels',
      ratingAvg: course.ratingAvg,
      ratingCount: course.ratingCount,
      isPremium: course.isPremium,
      ...extra,
    };
  }
}
