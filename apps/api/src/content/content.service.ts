import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signMediaUrl, fileNameFromUrl } from '../common/signed-url.util';
import { earlyAccessUntil, isEarlyAccess } from '../common/early-access';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active Premium, read from the plan row. Never trusted from the client. */
  private async isPremium(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, planExpiresAt: true },
    });
    return !!user && user.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
  }

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

    // Premium payloads (notes, attachments, note images) are gated exactly like
    // the video: previews open, otherwise an active premium plan is required.
    // This endpoint is public, so without this check the raw storage URLs in
    // `attachments` / `notes` bypassed the signed-URL entitlement entirely.
    const premiumActive = await this.isPremium(userId);
    // Early access: a course published inside its seven-day window is Premium
    // first, previews included, so the head start is real rather than cosmetic.
    const early = isEarlyAccess(lesson.course.publishedAt);
    const locked =
      !premiumActive && (early || (lesson.course.isPremium && !lesson.isPreview));
    const secret = process.env.JWT_SECRET || 'dev-only-secret-change-me';
    const sign = (url: string | null) => (url ? signMediaUrl(url, secret).url : null);

    return {
      id: lesson.id,
      title: lesson.title,
      orderIndex: lesson.orderIndex,
      type: lesson.type,
      durationSec: lesson.durationSec,
      isPreview: lesson.isPreview,
      sectionTitle: lesson.section?.title ?? null,
      course: { id: lesson.course.id, title: lesson.course.title, slug: lesson.course.slug },
      /** True when the viewer needs Premium to see the notes/attachments. */
      locked,
      /** Set while the course is still inside its Premium-first week. */
      earlyAccessUntil: early ? earlyAccessUntil(lesson.course.publishedAt)?.toISOString() ?? null : null,
      notes: locked
        ? []
        : lesson.notes.map((n) => {
            let imageUrls: string[] = [];
            try {
              const parsed = JSON.parse(n.imageUrls || '[]');
              if (Array.isArray(parsed)) imageUrls = parsed.filter((u): u is string => typeof u === 'string');
            } catch {
              imageUrls = [];
            }
            return {
              id: n.id,
              title: n.title,
              richText: n.richText,
              imageUrls: imageUrls.map((u) => sign(u) as string),
              pdfUrl: sign(n.pdfUrl),
              isCheatsheet: n.isCheatsheet,
            };
          }),
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
      // No raw `fileUrl` here: every download must go through
      // GET /lessons/:id/file-url, which checks entitlement and signs the URL.
      attachments: locked
        ? []
        : lesson.attachments.map((a) => ({
            id: a.id,
            fileType: a.fileType,
            sizeMb: a.sizeMb,
            fileName: fileNameFromUrl(a.fileUrl),
          })),
    };
  }

  /**
   * Signed video URL issuance.
   * Client → /lessons/:id/video-url → entitlement check (preview, then signed
   * in, then premium) → short-lived signed URL → stream from storage.
   */
  async getVideoUrl(lessonId: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const early = isEarlyAccess(lesson.course.publishedAt);
    if (early) {
      if (!userId) throw new ForbiddenException('This lesson opens to everyone soon — Premium members are watching it first');
      if (!(await this.isPremium(userId))) {
        throw new ForbiddenException('Early access is a Premium feature — this lesson opens to everyone in a few days');
      }
    } else if (!lesson.isPreview) {
      if (!userId) throw new ForbiddenException('Sign in to watch this lesson');
      if (lesson.course.isPremium && !(await this.isPremium(userId))) {
        throw new ForbiddenException('This course requires Premium');
      }
    }

    if (!lesson.videoUrl) {
      throw new NotFoundException('Video not available for this lesson yet');
    }
    return signMediaUrl(lesson.videoUrl, process.env.JWT_SECRET || 'dev-only-secret-change-me');
  }

  /**
   * Signed download URL for a lesson attachment (ZIPs, PDFs, notes).
   * Same entitlement model as video: previews open, everything else needs a
   * signed-in reader, and premium courses need an active premium plan.
   */
  async getFileUrl(lessonId: string, userId: string | undefined, attachmentId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, attachments: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const early = isEarlyAccess(lesson.course.publishedAt);
    if (early) {
      if (!userId) throw new ForbiddenException('This file opens to everyone soon — Premium members have it first');
      if (!(await this.isPremium(userId))) {
        throw new ForbiddenException('Early access is a Premium feature — this file opens to everyone in a few days');
      }
    } else if (!lesson.isPreview) {
      if (!userId) throw new ForbiddenException('Sign in to download this file');
      if (lesson.course.isPremium && !(await this.isPremium(userId))) {
        throw new ForbiddenException('This course requires Premium');
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
    await this.assertCanDownload(lesson, userId);
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

  /** Preview lessons are open; the rest need sign-in, and premium courses a plan. */
  private async assertCanDownload(
    lesson: { isPreview: boolean; course: { isPremium: boolean; publishedAt: Date } },
    userId: string | undefined,
  ): Promise<void> {
    const early = isEarlyAccess(lesson.course.publishedAt);
    if (early) {
      if (!userId) throw new ForbiddenException('Sign in to download this lesson');
      if (!(await this.isPremium(userId))) {
        throw new ForbiddenException('Early access is a Premium feature — downloads open to everyone in a few days');
      }
      return;
    }
    if (lesson.isPreview) return;
    if (!userId) throw new ForbiddenException('Sign in to download this lesson');
    if (lesson.course.isPremium) {
      if (!(await this.isPremium(userId))) throw new ForbiddenException('This course requires Premium');
    }
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
    await this.assertCanDownload(lesson, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.recordDownload(lessonId, userId, 'telegram', 'bot');

    const best = lesson.files[0];
    const appUrl = process.env.PUBLIC_APP_URL || 'https://syncourse-web.vercel.app';
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

  /**
   * Everything one course needs to live on a phone with no signal.
   *
   * The Premium offline library asks for this once, then the app downloads each
   * URL. Signed links carry an expiry so the app knows when to purge, and the
   * window never outlives the subscription: a plan ending in three days yields
   * links that die with it.
   */
  async offlineManifest(slug: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, planExpiresAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const premiumActive =
      user.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
    if (!premiumActive) {
      throw new ForbiddenException('The offline library is a Premium feature');
    }

    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              include: { attachments: true, notes: true, files: { orderBy: { isBest: 'desc' } } },
            },
          },
        },
      },
    });
    if (!course || course.deletedAt) throw new NotFoundException('Course not found');

    // Archive courses are delivered as Telegram files. There is no app-hosted
    // media to save, and silently returning an empty manifest made the download
    // look successful while storing nothing.
    if (!course.sections.some((s) => s.lessons.length > 0)) {
      throw new BadRequestException(
        'This course is delivered in Telegram. Open it from your chat to download the files — ' +
          'offline downloads work for courses with app-hosted lessons.',
      );
    }

    const now = Date.now();
    const planLeft = user.planExpiresAt
      ? Math.floor((user.planExpiresAt.getTime() - now) / 1000)
      : 7 * 24 * 60 * 60;
    // At least an hour, at most a week, and never past the plan.
    const ttl = Math.max(60 * 60, Math.min(7 * 24 * 60 * 60, planLeft));
    const secret = process.env.JWT_SECRET || 'dev-only-secret-change-me';
    const sign = (url: string | null) => (url ? signMediaUrl(url, secret, ttl) : null);

    const lessons = course.sections.flatMap((section) =>
      section.lessons.map((lesson) => {
        const best = lesson.files[0];
        return {
          id: lesson.id,
          title: lesson.title,
          orderIndex: lesson.orderIndex,
          sectionTitle: section.title,
          type: lesson.type,
          durationSec: lesson.durationSec,
          isPreview: lesson.isPreview,
          sizeMb: best ? best.sizeMb : 0,
          video: sign(lesson.videoUrl),
          attachments: lesson.attachments
            .map((a) => {
              const signed = sign(a.fileUrl);
              return {
                id: a.id,
                fileName: fileNameFromUrl(a.fileUrl),
                fileType: a.fileType,
                sizeMb: a.sizeMb,
                url: signed?.url ?? null,
                expiresAt: signed?.expiresAt ?? null,
              };
            })
            .filter((a) => a.url),
          notes: lesson.notes.map((n) => {
            let imageUrls: string[] = [];
            try {
              const parsed = JSON.parse(n.imageUrls || '[]');
              if (Array.isArray(parsed)) imageUrls = parsed.filter((u): u is string => typeof u === 'string');
            } catch {
              imageUrls = [];
            }
            return {
              id: n.id,
              title: n.title,
              richText: n.richText,
              isCheatsheet: n.isCheatsheet,
              imageUrls: imageUrls.map((u) => sign(u)?.url).filter((u): u is string => Boolean(u)),
              pdfUrl: sign(n.pdfUrl)?.url ?? null,
            };
          }),
        };
      }),
    );

    return {
      course: { id: course.id, slug: course.slug, title: course.title, thumbnailUrl: course.thumbnailUrl },
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl * 1000).toISOString(),
      totalLessons: lessons.length,
      totalBytes: lessons.reduce(
        (sum, l) =>
          sum + l.sizeMb * 1024 * 1024 + l.attachments.reduce((s, a) => s + a.sizeMb * 1024 * 1024, 0),
        0,
      ),
      lessons,
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
