import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signMediaUrl, fileNameFromUrl } from '../common/signed-url.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Lesson detail — mirrors the file metadata card from the reference. */
  async lessonDetail(lessonId: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: true,
        course: true,
        notes: true,
        files: true,
        attachments: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    let watched = false;
    let courseProgress = 0;
    if (userId) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId, courseId: lesson.courseId },
        include: { lessonProgress: { where: { lessonId } } },
      });
      if (enrollment) {
        courseProgress = enrollment.progressPct;
        watched = enrollment.lessonProgress.length > 0 && enrollment.lessonProgress[0].completed;
      }
    }

    return {
      id: lesson.id,
      title: lesson.title,
      orderIndex: lesson.orderIndex,
      type: lesson.type,
      durationSec: lesson.durationSec,
      isPreview: lesson.isPreview,
      sectionTitle: lesson.section?.title ?? null,
      course: { id: lesson.course.id, title: lesson.course.title, slug: lesson.course.slug },
      notes: lesson.notes.map((n) => ({
        id: n.id,
        title: n.title,
        richText: n.richText,
        imageUrls: JSON.parse(n.imageUrls || '[]'),
        pdfUrl: n.pdfUrl,
        isCheatsheet: n.isCheatsheet,
      })),
      files: lesson.files.map((f) => ({
        id: f.id,
        label: f.label,
        format: f.format,
        sizeMb: f.sizeMb,
        durationSec: f.durationSec,
        codec: f.codec,
        hasSubtitles: f.hasSubtitles,
        audio: f.audio,
        isBest: f.isBest,
      })),
      attachments: lesson.attachments.map((a) => ({
        id: a.id,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        sizeMb: a.sizeMb,
        fileName: fileNameFromUrl(a.fileUrl),
      })),
      watched,
      courseProgress,
    };
  }

  /**
   * Signed video URL issuance.
   * Client → /lessons/:id/video-url → entitlement check (preview or
   * enrollment or premium) → short-lived signed URL → stream from storage.
   */
  async getVideoUrl(lessonId: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      if (!userId) throw new ForbiddenException('Sign in to watch this lesson');
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId, courseId: lesson.courseId },
      });
      if (!enrollment) {
        throw new ForbiddenException('Enroll in this course to watch the lesson');
      }
      if (lesson.course.isPremium) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const premiumActive =
          user?.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
        if (!premiumActive) throw new ForbiddenException('This course requires Premium');
      }
    }

    if (!lesson.videoUrl) {
      throw new NotFoundException('Video not available for this lesson yet');
    }
    return signMediaUrl(lesson.videoUrl, process.env.JWT_SECRET || 'dev-only-secret-change-me');
  }

  /**
   * Signed download URL for a lesson attachment (ZIPs, PDFs, notes).
   * Same entitlement model as video: previews open, enrolled required otherwise,
   * premium courses require an active premium plan.
   */
  async getFileUrl(lessonId: string, userId: string | undefined, attachmentId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, attachments: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      if (!userId) throw new ForbiddenException('Sign in to download this file');
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId, courseId: lesson.courseId },
      });
      if (!enrollment) {
        throw new ForbiddenException('Enroll in this course to download files');
      }
      if (lesson.course.isPremium) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const premiumActive =
          user?.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
        if (!premiumActive) throw new ForbiddenException('This course requires Premium');
      }
    }

    const attachment = lesson.attachments.find((a) => a.id === attachmentId);
    if (!attachment) throw new NotFoundException('File not found on this lesson');
    const signed = signMediaUrl(attachment.fileUrl, process.env.JWT_SECRET || 'dev-only-secret-change-me');
    return {
      ...signed,
      fileName: fileNameFromUrl(attachment.fileUrl),
      fileType: attachment.fileType,
      sizeMb: attachment.sizeMb,
    };
  }

  /** Record a download event + bump the course's download counter (web analytics widget). */
  async recordDownload(lessonId: string, userId: string | undefined, quality?: string, method = 'app') {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const event = await this.prisma.downloadEvent.create({
      data: {
        lessonId,
        courseId: lesson.courseId,
        userId: userId ?? null,
        quality: quality ?? null,
        method,
      },
    });
    await this.prisma.course.update({
      where: { id: lesson.courseId },
      data: { downloadCount: { increment: 1 } },
    });
    return { id: event.id, recorded: true };
  }

  /**
   * "Download to Telegram" — sends the lesson file link to the user's linked
   * Telegram via the bot. Requires the user to have started the bot (telegramId).
   */
  async downloadToTelegram(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, files: { orderBy: { isBest: 'desc' } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.recordDownload(lessonId, userId, 'telegram', 'bot');

    const best = lesson.files[0];
    const appUrl = process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev';
    const link = `${appUrl}/courses/${lesson.course.slug}/lessons/${lesson.id}`;
    const sizeText = best ? ` · ${best.sizeMb.toFixed(1)} MB ${best.label}` : '';
    const text = `📚 Syncourse download\n\n${lesson.course.title}\n${lesson.title}${sizeText}\n\n${link}`;

    if (user.telegramId) {
      const sent = await this.notifications.sendViaTelegram(user.id, text);
      return { sent, telegramUsername: user.telegramUsername, message: sent ? 'Sent to your Telegram' : 'Could not reach your Telegram chat — open the bot first' };
    }
    // No chat id yet — give the user a deep link to start the bot.
    const bot = process.env.TELEGRAM_BOT_USERNAME || 'syncourse_bot';
    return {
      sent: false,
      telegramUsername: user.telegramUsername,
      botUrl: `https://t.me/${bot}?start=download_${lesson.id}`,
      message: 'Open the bot and press Start, then try again — or tap to open the bot now.',
    };
  }

  /** Downloads analytics for a course (TOTAL / LAST 30 DAYS / LAST 7 DAYS / TODAY). */
  async courseDownloadStats(courseId: string) {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const [total, last30, last7, today, recent] = await Promise.all([
      this.prisma.downloadEvent.count({ where: { courseId } }),
      this.prisma.downloadEvent.count({ where: { courseId, createdAt: { gte: new Date(now.getTime() - 30 * day) } } }),
      this.prisma.downloadEvent.count({ where: { courseId, createdAt: { gte: new Date(now.getTime() - 7 * day) } } }),
      this.prisma.downloadEvent.count({ where: { courseId, createdAt: { gte: new Date(now.getTime() - day) } } }),
      this.prisma.downloadEvent.findMany({
        where: { courseId, createdAt: { gte: new Date(now.getTime() - 14 * day) } },
        select: { createdAt: true },
      }),
    ]);

    // 14-day sparkline: downloads per day (oldest → newest)
    const sparkline = new Array(14).fill(0);
    for (const ev of recent) {
      const idx = Math.floor((now.getTime() - ev.createdAt.getTime()) / day);
      if (idx >= 0 && idx < 14) sparkline[13 - idx]++;
    }
    return { total, last30, last7, today, sparkline };
  }
}
