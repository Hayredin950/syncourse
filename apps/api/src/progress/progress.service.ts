import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { earlyAccessUntil, isEarlyAccess } from '../common/early-access';

const APP_URL = () => (process.env.PUBLIC_APP_URL || 'https://syncourse-web.vercel.app').replace(/\/+$/, '');

/** Two short groups, easy to read over the phone and impossible to guess. */
function newSerial(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `SYN-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private async isPremium(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, planExpiresAt: true },
    });
    return !!user && user.planType === 'premium' && (!user.planExpiresAt || user.planExpiresAt > new Date());
  }

  /**
   * Mark one lesson complete (or clear it). Progress is free, but a locked
   * premium lesson cannot be marked by someone who has not unlocked it.
   */
  async setLessonProgress(userId: string, lessonId: string, completed: boolean) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: { select: { id: true, slug: true, isPremium: true, publishedAt: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const early = isEarlyAccess(lesson.course.publishedAt);
    if ((early || (lesson.course.isPremium && !lesson.isPreview)) && !(await this.isPremium(userId))) {
      throw new ForbiddenException(
        early ? 'This lesson opens to everyone soon — Premium members have it first' : 'This lesson is part of Premium',
      );
    }

    if (completed) {
      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId },
        update: {},
      });
    } else {
      await this.prisma.lessonProgress.deleteMany({ where: { userId, lessonId } });
    }

    return this.courseProgress(lesson.course.slug, userId);
  }

  /** Lesson-level progress for one course, plus the certificate if it exists. */
  async courseProgress(slug: string, userId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        isPremium: true,
        publishedAt: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          select: {
            title: true,
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: { id: true, title: true, durationSec: true, isPreview: true },
            },
          },
        },
        certificates: userId
          ? { where: { userId }, select: { serial: true, issuedAt: true } }
          : false,
      },
    });
    if (!course) throw new NotFoundException('Course not found');

    const lessons = course.sections.flatMap((s) =>
      s.lessons.map((l) => ({ ...l, sectionTitle: s.title })),
    );
    const completedIds = userId
      ? new Set(
          (
            await this.prisma.lessonProgress.findMany({
              where: { userId, lessonId: { in: lessons.map((l) => l.id) } },
              select: { lessonId: true },
            })
          ).map((p) => p.lessonId),
        )
      : new Set<string>();

    const total = lessons.length;
    const completed = lessons.filter((l) => completedIds.has(l.id)).length;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    const premiumActive = await this.isPremium(userId);
    const certificate = userId ? course.certificates?.[0] ?? null : null;

    return {
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      total,
      completed,
      pct,
      premiumActive,
      earlyAccessUntil: isEarlyAccess(course.publishedAt)
        ? earlyAccessUntil(course.publishedAt)?.toISOString() ?? null
        : null,
      canIssue: Boolean(userId) && premiumActive && total > 0 && completed === total && !certificate,
      certificate: certificate
        ? {
            serial: certificate.serial,
            issuedAt: certificate.issuedAt,
            verifyUrl: `${APP_URL()}/certificates/${certificate.serial}`,
            pdfUrl: `${APP_URL()}/api/certificates/${certificate.serial}/pdf`,
          }
        : null,
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        sectionTitle: l.sectionTitle,
        durationSec: l.durationSec,
        isPreview: l.isPreview,
        completed: completedIds.has(l.id),
      })),
    };
  }

  /**
   * Issue the Premium certificate once every lesson is marked complete.
   * Idempotent: asking twice returns the same serial instead of minting a
   * second one, and the unique (user, course) index is the real guard.
   */
  async issueCertificate(userId: string, courseIdOrSlug: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: courseIdOrSlug }, { slug: courseIdOrSlug }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        sections: { select: { lessons: { select: { id: true } } } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');

    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });
    if (existing) return this.certificatePayload(existing.serial);

    if (!(await this.isPremium(userId))) {
      throw new ForbiddenException('Certificates are a Premium feature');
    }

    const lessonIds = course.sections.flatMap((s) => s.lessons.map((l) => l.id));
    if (lessonIds.length === 0) {
      throw new BadRequestException('This course has no lessons to complete yet.');
    }
    const completed = await this.prisma.lessonProgress.count({
      where: { userId, lessonId: { in: lessonIds } },
    });
    if (completed < lessonIds.length) {
      throw new BadRequestException(
        `Mark all ${lessonIds.length} lessons complete first — ${completed} done.`,
      );
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.certificate.create({
          data: { serial: newSerial(), userId, courseId: course.id },
        });
        return this.certificatePayload(row.serial);
      } catch {
        // A serial collision is vanishingly rare; a concurrent second request
        // for the same user+course is not, so look that one up and return it.
        const raced = await this.prisma.certificate.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
        });
        if (raced) return this.certificatePayload(raced.serial);
      }
    }
    throw new BadRequestException('Could not issue a certificate. Try again.');
  }

  private async certificatePayload(serial: string) {
    const row = await this.prisma.certificate.findUnique({
      where: { serial },
      include: {
        course: { select: { title: true, slug: true } },
        user: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Certificate not found');
    return {
      serial: row.serial,
      issuedAt: row.issuedAt,
      learnerName: row.user.name,
      courseTitle: row.course.title,
      courseSlug: row.course.slug,
      verifyUrl: `${APP_URL()}/certificates/${row.serial}`,
      pdfUrl: `${APP_URL()}/api/certificates/${row.serial}/pdf`,
    };
  }

  /** Public verification payload. No email, no account id, no payment data. */
  async verify(serial: string) {
    const row = await this.prisma.certificate.findUnique({
      where: { serial: serial.trim().toUpperCase() },
      include: {
        course: { select: { title: true, slug: true, thumbnailUrl: true } },
        user: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('No certificate matches that number.');
    return {
      valid: true,
      serial: row.serial,
      issuedAt: row.issuedAt,
      learnerName: row.user.name,
      courseTitle: row.course.title,
      courseSlug: row.course.slug,
      thumbnailUrl: row.course.thumbnailUrl,
      verifyUrl: `${APP_URL()}/certificates/${row.serial}`,
    };
  }

  async myCertificates(userId: string) {
    const rows = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: { course: { select: { title: true, slug: true, thumbnailUrl: true } } },
    });
    return rows.map((r) => ({
      serial: r.serial,
      issuedAt: r.issuedAt,
      courseTitle: r.course.title,
      courseSlug: r.course.slug,
      thumbnailUrl: r.course.thumbnailUrl,
      verifyUrl: `${APP_URL()}/certificates/${r.serial}`,
      pdfUrl: `${APP_URL()}/api/certificates/${r.serial}/pdf`,
    }));
  }

  /** A printable A4-landscape certificate. Standard fonts keep it dependency-free. */
  async certificatePdf(serial: string) {
    const row = await this.prisma.certificate.findUnique({
      where: { serial: serial.trim().toUpperCase() },
      include: {
        user: { select: { name: true } },
        course: { select: { title: true } },
      },
    });
    if (!row) throw new NotFoundException('Certificate not found');

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const { width, height } = page.getSize();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.09, 0.08, 0.07);
    const accent = rgb(0.98, 0.72, 0.18);
    const muted = rgb(0.38, 0.37, 0.35);

    page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: accent, borderWidth: 3 });
    page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: rgb(0.85, 0.82, 0.75), borderWidth: 0.7 });

    const center = (text: string, y: number, size: number, font: PDFFont, color = ink) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (width - w) / 2, y, size, font, color });
    };

    center('SYNCOURSE', 500, 13, bold, accent);
    center('CERTIFICATE OF COMPLETION', 456, 29, bold);
    center('This certifies that', 414, 12, regular, muted);
    center(row.user.name, 370, row.user.name.length > 34 ? 26 : 36, bold);

    const title = row.course.title;
    const titleLines = wrap(title, bold, 19, 600);
    titleLines.slice(0, 2).forEach((line, i) => center(line, 326 - i * 24, 19, bold));
    center('completed every lesson in this course on Syncourse.', 270, 12, regular, muted);

    page.drawLine({ start: { x: 250, y: 232 }, end: { x: width - 250, y: 232 }, thickness: 0.8, color: rgb(0.8, 0.77, 0.7) });
    center(new Date(row.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 208, 12, regular);
    center(`Certificate ${row.serial}`, 182, 11, bold, muted);
    center(`${APP_URL()}/certificates/${row.serial}`, 164, 9, regular, muted);

    const bytes = await pdf.save();
    return { bytes: Buffer.from(bytes), fileName: `Syncourse-${row.serial}.pdf` };
  }
}

/** Greedy word wrap for the two lines a long course title may need. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
