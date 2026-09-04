import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Saved, liked and downloaded courses for one reader.
 *
 * Deliberately has no enrolment and no progress: the whole course arrives as
 * one or more Telegram archives, so there is no "35% through" to record. A
 * download is the strongest signal there is that someone is actually working
 * through a course, so that is what the library is built on.
 */
@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async myLibrary(userId: string) {
    const [saved, liked, downloads] = await Promise.all([
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
      // One row per course, newest first: a reader who pulled all six parts of
      // a course has taken one course, not six.
      this.prisma.downloadEvent.findMany({
        where: { userId, course: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        distinct: ['courseId'],
        take: 60,
        include: { course: true },
      }),
    ]);

    const downloaded = downloads.map((d) => this.flat(d.course, { downloadedAt: d.createdAt }));

    return {
      saved: saved.map((s) => this.flat(s.course, { savedAt: s.createdAt })),
      liked: liked.map((l) => this.flat(l.course, { likedAt: l.createdAt })),
      downloaded,
      counts: { saved: saved.length, liked: liked.length, downloaded: downloaded.length },
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

  /**
   * Toggle a like and return the new public tally with it. The button on the
   * course page prints that number, so it has to come back from the row count
   * rather than being guessed client-side — otherwise two readers liking at the
   * same moment each see their own +1 and neither sees the other's.
   */
  async likeCourse(userId: string, courseIdOrSlug: string) {
    const course = await this.findCourse(courseIdOrSlug);
    if (!course) throw new NotFoundException('Course not found');
    const courseId = course.id;
    const existing = await this.prisma.likedCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      await this.prisma.likedCourse.delete({ where: { userId_courseId: { userId, courseId } } });
      return { liked: false, likeCount: await this.prisma.likedCourse.count({ where: { courseId } }) };
    }
    await this.prisma.likedCourse.create({ data: { userId, courseId } });
    return { liked: true, likeCount: await this.prisma.likedCourse.count({ where: { courseId } }) };
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
      downloadCount: course.downloadCount,
      isPremium: course.isPremium,
      ...extra,
    };
  }
}
