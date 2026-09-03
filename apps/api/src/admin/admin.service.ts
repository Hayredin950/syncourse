import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService, type UploadKind } from '../cloudinary/cloudinary.service';
import { parseChatRef, TelegramService } from '../telegram/telegram.service';
import { bumpVersion, legalTitle } from '../legal/legal.constants';

export interface AdminLessonInput {
  title: string;
  type?: string;
  durationSec?: number;
  videoUrl?: string;
  isPreview?: boolean;
  /** Downloadable file attached to this lesson (ZIPs, PDFs…). */
  fileUrl?: string;
  fileLabel?: string;
  fileSizeMb?: number;
}

export interface AdminSectionInput {
  title: string;
  lessons?: AdminLessonInput[];
}

export interface AdminCourseInput {
  title?: string;
  description?: string;
  categoryNames?: string[];
  levelName?: string;
  /** Every teacher credited on the course, in the order they should be printed. */
  lecturerNames?: string[];
  /**
   * Deprecated single-teacher field. Still honoured so a client that has not
   * been redeployed keeps working; treated as a one-name `lecturerNames`.
   */
  lecturerName?: string;
  organizationName?: string;
  language?: string;
  originalPrice?: number;
  price?: number;
  isPremium?: boolean;
  isFeatured?: boolean;
  contentType?: string;
  tags?: string[];
  audience?: string[];
  prerequisites?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  previewVideoUrl?: string;
  sections?: AdminSectionInput[];
}

export interface AdminLecturerInput {
  name?: string;
  bio?: string;
  photoUrl?: string;
}

export interface AdminPublisherInput {
  name?: string;
  orgType?: string;
  logoUrl?: string;
  description?: string;
}

export interface AdminCategoryInput {
  name?: string;
  icon?: string;
  sortOrder?: number;
}

export interface AdminResourceMediaInput {
  kind?: string;
  url?: string;
  fileName?: string;
  fileSizeMb?: number;
  caption?: string;
}

export interface AdminResourceInput {
  type?: string;
  title?: string;
  summary?: string;
  bodyMd?: string;
  coverUrl?: string;
  categoryName?: string;
  lecturerName?: string;
  organizationName?: string;
  tags?: string[];
  isPremium?: boolean;
  isFeatured?: boolean;
  sourceUrl?: string;
  readMinutes?: number;
  /** Whole list, replacing whatever is stored — same contract as course sections. */
  media?: AdminResourceMediaInput[];
}

export interface AdminLegalInput {
  type?: string;
  title?: string;
  version?: string;
  bodyMd?: string;
  changeSummary?: string;
  requiresAcceptance?: boolean;
  effectiveAt?: string;
  /**
   * Fix a typo without bumping the version or prompting anyone. Any version
   * typed alongside it is ignored — see updateLegal for why.
   */
  minorEdit?: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly telegram: TelegramService,
  ) {}

  private async assertStaff(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isStaff: true } });
    if (!user?.isStaff) throw new ForbiddenException('Staff access required');
  }

  /** All courses (including soft-deleted) for the CMS dashboard. */
  async listCourses(userId: string) {
    await this.assertStaff(userId);
    const courses = await this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        level: true,
        lecturers: { include: { lecturer: true }, orderBy: { orderIndex: 'asc' } },
        organization: true,
        _count: { select: { sections: true, telegramFiles: true } },
      },
    });
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      contentType: c.contentType,
      thumbnailUrl: c.thumbnailUrl,
      isPremium: c.isPremium,
      isFeatured: c.isFeatured,
      ratingAvg: c.ratingAvg,
      downloadCount: c.downloadCount,
      deleted: c.deletedAt !== null,
      sectionCount: c._count.sections,
      fileCount: c._count.telegramFiles,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      level: c.level?.name ?? null,
      // One cell, every teacher: "Andrei Neagoie, Daniel Bourke".
      lecturer: c.lecturers.map((cl) => cl.lecturer.name).join(', ') || null,
      organization: c.organization?.name ?? null,
    }));
  }

  /** Full course (with sections + lessons) for the edit form. */
  async getCourse(userId: string, slug: string) {
    await this.assertStaff(userId);
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        level: true,
        lecturers: { include: { lecturer: true }, orderBy: { orderIndex: 'asc' } },
        organization: true,
        categories: { include: { category: true } },
        tags: true,
        audience: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: { lessons: { orderBy: { orderIndex: 'asc' }, include: { attachments: true } } },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      categoryNames: course.categories.map((cc) => cc.category.name),
      levelName: course.level?.name ?? null,
      lecturerNames: course.lecturers.map((cl) => cl.lecturer.name),
      // Kept so a form loaded from an older build still fills its one field.
      lecturerName: course.lecturers[0]?.lecturer.name ?? null,
      organizationName: course.organization?.name ?? null,
      language: course.language,
      originalPrice: course.originalPrice,
      price: course.price,
      isPremium: course.isPremium,
      isFeatured: course.isFeatured,
      contentType: course.contentType,
      tags: course.tags.map((t) => t.tag),
      audience: course.audience.map((a) => a.audienceTag),
      prerequisites: course.prerequisites,
      thumbnailUrl: course.thumbnailUrl,
      bannerUrl: course.bannerUrl,
      previewVideoUrl: course.previewVideoUrl,
      sections: course.sections.map((s) => ({
        id: s.id,
        title: s.title,
        lessons: s.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          durationSec: l.durationSec,
          videoUrl: l.videoUrl,
          isPreview: l.isPreview,
          fileUrl: l.attachments[0]?.fileUrl ?? null,
          fileLabel: l.attachments[0] ? labelFromUrl(l.attachments[0].fileUrl) : null,
          fileSizeMb: l.attachments[0]?.sizeMb ?? null,
        })),
      })),
    };
  }

  /** Create a course with nested sections/lessons. */
  async createCourse(userId: string, dto: AdminCourseInput) {
    await this.assertStaff(userId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!dto.description?.trim()) throw new BadRequestException('Description is required');
    const title = dto.title.trim();
    const description = dto.description.trim();

    const slug = await this.uniqueSlug(slugify(title));
    const { levelId, lecturerIds, organizationId, categoryIds } = await this.resolveRefs(dto);

    const course = await this.prisma.$transaction(async (tx) => {
      const c = await tx.course.create({
        data: {
          title,
          slug,
          description,
          language: dto.language || 'English',
          levelId,
          // Mirror of the first credit, kept only while the deprecated column lives.
          lecturerId: lecturerIds[0] ?? null,
          organizationId,
          originalPrice: dto.originalPrice ?? null,
          price: dto.price ?? dto.originalPrice ?? null,
          isPremium: dto.isPremium ?? false,
          isFeatured: dto.isFeatured ?? false,
          contentType: dto.contentType || 'course',
          prerequisites: dto.prerequisites || null,
          thumbnailUrl: dto.thumbnailUrl || null,
          bannerUrl: dto.bannerUrl || null,
          previewVideoUrl: dto.previewVideoUrl || null,
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
          lecturers: { create: lecturerIds.map((lecturerId, i) => ({ lecturerId, orderIndex: i })) },
          tags: { create: (dto.tags ?? []).map((tag) => ({ tag: tag.trim() })) },
          audience: { create: (dto.audience ?? []).map((a) => ({ audienceTag: a.trim() })) },
        },
      });
      await this.createSections(tx, c.id, dto.sections ?? []);
      return c;
    });
    return { id: course.id, slug: course.slug, title: course.title };
  }

  /** Update a course: metadata + optional section/lesson replacement. */
  async updateCourse(userId: string, slug: string, dto: AdminCourseInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.course.findUnique({ where: { slug } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Course not found');

    const { levelId, lecturerIds, organizationId, categoryIds } = await this.resolveRefs(dto, existing);
    const lecturerNames = requestedLecturers(dto);

    const data: Prisma.CourseUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.levelName !== undefined ? { level: levelId ? { connect: { id: levelId } } : { disconnect: true } } : {}),
      ...(lecturerNames !== undefined
        ? {
            // Whole credit list replaced, and the deprecated single link follows the
            // first name so both shapes agree until the column goes.
            lecturers: {
              deleteMany: {},
              create: lecturerIds.map((lecturerId, i) => ({ lecturerId, orderIndex: i })),
            },
            lecturer: lecturerIds[0] ? { connect: { id: lecturerIds[0] } } : { disconnect: true },
          }
        : {}),
      ...(dto.organizationName !== undefined
        ? { organization: organizationId ? { connect: { id: organizationId } } : { disconnect: true } }
        : {}),
      ...(dto.originalPrice !== undefined ? { originalPrice: dto.originalPrice } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.isPremium !== undefined ? { isPremium: dto.isPremium } : {}),
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.contentType !== undefined ? { contentType: dto.contentType } : {}),
      ...(dto.prerequisites !== undefined ? { prerequisites: dto.prerequisites || null } : {}),
      ...(dto.thumbnailUrl !== undefined ? { thumbnailUrl: dto.thumbnailUrl || null } : {}),
      ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl || null } : {}),
      ...(dto.previewVideoUrl !== undefined ? { previewVideoUrl: dto.previewVideoUrl || null } : {}),
      ...(dto.categoryNames !== undefined
        ? { categories: { deleteMany: {}, create: categoryIds.map((categoryId) => ({ categoryId })) } }
        : {}),
      ...(dto.tags !== undefined
        ? { tags: { deleteMany: {}, create: dto.tags.map((tag) => ({ tag: tag.trim() })) } }
        : {}),
      ...(dto.audience !== undefined
        ? { audience: { deleteMany: {}, create: dto.audience.map((a) => ({ audienceTag: a.trim() })) } }
        : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.course.update({ where: { slug }, data });
      if (dto.sections !== undefined) {
        await tx.section.deleteMany({ where: { courseId: existing.id } }); // cascades lessons
        await this.createSections(tx, existing.id, dto.sections);
      }
      return u;
    });
    return { id: updated.id, slug: updated.slug, title: updated.title };
  }

  /** Create sections + lessons inside a transaction (createMany needs the known courseId). */
  private async createSections(
    tx: Prisma.TransactionClient,
    courseId: string,
    sections: AdminSectionInput[],
  ): Promise<void> {
    for (const [si, s] of sections.entries()) {
      if (!s.title?.trim()) continue;
      const section = await tx.section.create({
        data: { courseId, title: s.title.trim(), orderIndex: si },
      });
      const lessons = (s.lessons ?? [])
        .filter((l) => l.title?.trim())
        .map((l, li) => ({
          courseId,
          sectionId: section.id,
          title: l.title.trim(),
          type: l.type || 'video',
          durationSec: l.durationSec ?? 0,
          videoUrl: l.videoUrl || null,
          isPreview: l.isPreview ?? false,
          orderIndex: li,
          ...(l.fileUrl?.trim()
            ? {
                attachments: {
                  create: {
                    fileUrl: l.fileUrl.trim(),
                    fileType: fileTypeOf(l.fileUrl.trim()),
                    sizeMb: l.fileSizeMb ?? 0,
                  },
                },
              }
            : {}),
        }));
      for (const data of lessons) {
        await tx.lesson.create({ data });
      }
    }
  }

  /** Soft-delete a course (rows stay, so reviews and download history survive). */
  async deleteCourse(userId: string, slug: string) {
    await this.assertStaff(userId);
    const existing = await this.prisma.course.findUnique({ where: { slug } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Course not found');
    await this.prisma.course.update({ where: { slug }, data: { deletedAt: new Date() } });
    return { deleted: true, slug };
  }

  /** All users for the admin Users tab (staff can promote/demote). */
  async listUsers(userId: string) {
    await this.assertStaff(userId);
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        avatarUrl: true,
        isStaff: true,
        isVerified: true,
        planType: true,
        createdAt: true,
        _count: {
          select: { downloads: true, reviews: true, lists: true },
        },
      },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      avatarUrl: u.avatarUrl,
      isStaff: u.isStaff,
      isVerified: u.isVerified,
      planType: u.planType,
      createdAt: u.createdAt,
      downloads: u._count.downloads,
      reviews: u._count.reviews,
      lists: u._count.lists,
    }));
  }

  /** Promote/demote a user to/from staff. Staff can't demote themselves (no lockout). */
  async setUserRole(userId: string, targetId: string, body: { isStaff?: boolean }) {
    await this.assertStaff(userId);
    if (targetId === userId) {
      throw new BadRequestException('You cannot change your own admin role');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, isStaff: true },
    });
    if (!target) throw new NotFoundException('User not found');
    const isStaff = body.isStaff ?? false;
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { isStaff },
      select: { id: true, email: true, isStaff: true },
    });
    return {
      ...updated,
      message: isStaff
        ? `${target.email} is now an admin`
        : `${target.email} is no longer an admin`,
    };
  }

  /** Cover update (kept from the earlier admin pass). */
  async updateCourseCover(
    userId: string,
    slug: string,
    body: { thumbnailUrl?: string; bannerUrl?: string },
  ) {
    await this.assertStaff(userId);
    if (body.thumbnailUrl === undefined && body.bannerUrl === undefined) {
      throw new BadRequestException('Provide thumbnailUrl and/or bannerUrl');
    }
    const url = body.thumbnailUrl ?? body.bannerUrl;
    if (url && !/^https?:\/\//.test(url)) {
      throw new BadRequestException('Image URLs must start with http(s)://');
    }
    const course = await this.prisma.course.findUnique({ where: { slug } });
    if (!course) throw new NotFoundException('Course not found');
    const updated = await this.prisma.course.update({
      where: { slug },
      data: {
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl || null } : {}),
        ...(body.bannerUrl !== undefined ? { bannerUrl: body.bannerUrl || null } : {}),
      },
      select: { slug: true, title: true, thumbnailUrl: true, bannerUrl: true },
    });
    return updated;
  }

  // ================= Admin console: dashboard + moderation =================

  /** Platform overview numbers for the Dashboard. */
  async stats(userId: string) {
    await this.assertStaff(userId);
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [courses, users, premium, revenue, pendingPayments, reviewsTotal, reviews7d, lists, circles] =
      await Promise.all([
        this.prisma.course.count({ where: { deletedAt: null } }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { planType: 'premium' } }),
        this.prisma.subscription.aggregate({
          where: { status: 'approved', createdAt: { gte: monthAgo } },
          _sum: { amount: true },
        }),
        this.prisma.subscription.count({ where: { status: 'pending' } }),
        this.prisma.review.count(),
        this.prisma.review.count({ where: { createdAt: { gte: monthAgo } } }),
        this.prisma.collectionList.count(),
        this.prisma.circle.count(),
      ]);
    return {
      courses,
      users,
      premiumSubscribers: premium,
      revenue30d: revenue._sum.amount ?? 0,
      pendingPayments,
      reviewsTotal,
      reviews7d,
      lists,
      circles,
    };
  }

  /** Recent platform events (signups, reviews, subscriptions, courses) for the Dashboard feed. */
  async activity(userId: string) {
    await this.assertStaff(userId);
    const [users, reviews, subs, courses] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      this.prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: { select: { name: true } },
          course: { select: { title: true } },
        },
      }),
      this.prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { name: true } } },
      }),
      this.prisma.course.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
    ]);
    const events: Array<{
      type: 'user' | 'review' | 'payment' | 'course';
      title: string;
      detail?: string;
      createdAt: Date;
    }> = [
      ...users.map((u) => ({
        type: 'user' as const,
        title: `${u.name} joined`,
        detail: u.email,
        createdAt: u.createdAt,
      })),
      ...reviews.map((r) => ({
        type: 'review' as const,
        title: `${r.user.name} reviewed “${r.course.title}”`,
        detail: r.body.slice(0, 80),
        createdAt: r.createdAt,
      })),
      ...subs.map((s) => ({
        type: 'payment' as const,
        title: `${s.user.name} — ${s.planName} (${s.paymentMethod})`,
        detail: s.status,
        createdAt: s.createdAt,
      })),
      ...courses.map((c) => ({
        type: 'course' as const,
        title: `Course published: ${c.title}`,
        createdAt: c.createdAt,
      })),
    ];
    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return events.slice(0, 12);
  }

  /** All reviews (with course + author) for moderation. */
  async listReviews(userId: string) {
    await this.assertStaff(userId);
    const reviews = await this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        course: { select: { id: true, slug: true, title: true, thumbnailUrl: true } },
        _count: { select: { replies: true, upvotedBy: true } },
      },
    });
    return reviews.map((r) => ({
      id: r.id,
      body: r.body,
      containsSpoilers: r.containsSpoilers,
      createdAt: r.createdAt,
      author: r.user,
      course: r.course,
      replyCount: r._count.replies,
      upvoteCount: r._count.upvotedBy,
    }));
  }

  /** Hard-delete a review (and its threaded replies). */
  async removeReview(userId: string, reviewId: string) {
    await this.assertStaff(userId);
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id: reviewId } }); // cascades replies
    return { deleted: true, id: reviewId };
  }

  /** Payment queue: all subscriptions with their references. */
  async listPayments(userId: string) {
    await this.assertStaff(userId);
    const subs = await this.prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, telegramUsername: true } },
        paymentRefs: true,
      },
    });
    return subs.map((s) => ({
      id: s.id,
      planName: s.planName,
      paymentMethod: s.paymentMethod,
      amount: s.amount,
      currency: s.currency,
      status: s.status,
      txReference: s.txReference,
      createdAt: s.createdAt,
      user: s.user,
      references: s.paymentRefs,
    }));
  }

  /** Approve/reject a payment. Approving also upgrades the user to premium. */
  async reviewPayment(userId: string, subscriptionId: string, status: 'approved' | 'rejected') {
    await this.assertStaff(userId);
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    const days =
      sub.planName === '1_month' ? 30 : sub.planName === '3_months' ? 90 : sub.planName === '6_months' ? 180 : 30;
    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status,
          periodStart: status === 'approved' ? new Date() : undefined,
          periodEnd:
            status === 'approved'
              ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
              : undefined,
        },
      });
      if (status === 'approved') {
        await tx.user.update({
          where: { id: sub.userId },
          data: {
            planType: 'premium',
            planExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          },
        });
        await tx.notification.create({
          data: {
            userId: sub.userId,
            type: 'system',
            title: 'Premium activated 🎉',
            body: `Your ${sub.planName} plan is active. Enjoy full-speed downloads and an ad-free experience.`,
          },
        });
      }
      return s;
    });
    return {
      id: updated.id,
      status: updated.status,
      message: status === 'approved' ? `${sub.user.name} is now Premium` : 'Payment rejected',
    };
  }

  // --- Lecturers / Publishers / Categories management ---

  async listLecturers(userId: string) {
    await this.assertStaff(userId);
    const rows = await this.prisma.lecturer.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courseLinks: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      photoUrl: l.photoUrl,
      bio: l.bio,
      credentials: l.credentials,
      courseCount: l._count.courseLinks,
      createdAt: l.createdAt,
    }));
  }

  async createLecturer(userId: string, dto: AdminLecturerInput) {
    await this.assertStaff(userId);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const name = dto.name.trim();
    const lecturer = await this.prisma.lecturer.create({
      data: {
        name,
        slug: await this.uniqueSlugFor('lecturer', slugify(name)),
        bio: dto.bio || null,
        photoUrl: dto.photoUrl || null,
      },
    });
    return { id: lecturer.id, name: lecturer.name, slug: lecturer.slug };
  }

  async updateLecturer(userId: string, id: string, dto: AdminLecturerInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.lecturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lecturer not found');
    const updated = await this.prisma.lecturer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio || null } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl || null } : {}),
      },
    });
    return { id: updated.id, name: updated.name };
  }

  async removeLecturer(userId: string, id: string) {
    await this.assertStaff(userId);
    // Counted through the join table: a co-teacher who is nobody's first credit
    // is still teaching, and deleting them would silently cascade the link away.
    const count = await this.prisma.course.count({
      where: { deletedAt: null, lecturers: { some: { lecturerId: id } } },
    });
    if (count > 0) {
      throw new BadRequestException(`This lecturer teaches ${count} course(s) — reassign them first.`);
    }
    await this.prisma.lecturer.delete({ where: { id } });
    return { deleted: true, id };
  }

  async listPublishers(userId: string) {
    await this.assertStaff(userId);
    const rows = await this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return rows.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      logoUrl: o.logoUrl,
      orgType: o.orgType,
      description: o.description,
      subscribers: o.subscribers,
      courseCount: o._count.courses,
      createdAt: o.createdAt,
    }));
  }

  async createPublisher(userId: string, dto: AdminPublisherInput) {
    await this.assertStaff(userId);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const name = dto.name.trim();
    const org = await this.prisma.organization.create({
      data: {
        name,
        slug: await this.uniqueSlugFor('organization', slugify(name)),
        orgType: dto.orgType || 'publisher',
        logoUrl: dto.logoUrl || null,
        description: dto.description || null,
      },
    });
    return { id: org.id, name: org.name, slug: org.slug };
  }

  async updatePublisher(userId: string, id: string, dto: AdminPublisherInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Publisher not found');
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.orgType !== undefined ? { orgType: dto.orgType } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      },
    });
    return { id: updated.id, name: updated.name };
  }

  async removePublisher(userId: string, id: string) {
    await this.assertStaff(userId);
    const count = await this.prisma.course.count({ where: { organizationId: id, deletedAt: null } });
    if (count > 0) {
      throw new BadRequestException(`This publisher has ${count} course(s) — reassign them first.`);
    }
    await this.prisma.organization.delete({ where: { id } });
    return { deleted: true, id };
  }

  async listCategories(userId: string) {
    await this.assertStaff(userId);
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      coverImage: c.coverImage,
      sortOrder: c.sortOrder,
      courseCount: c._count.courses,
      createdAt: c.createdAt,
    }));
  }

  async createCategory(userId: string, dto: AdminCategoryInput) {
    await this.assertStaff(userId);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const name = dto.name.trim();
    const existing = await this.prisma.category.findFirst({ where: { name } });
    if (existing) throw new BadRequestException(`Category “${name}” already exists`);
    const max = await this.prisma.category.aggregate({ _max: { sortOrder: true } });
    const category = await this.prisma.category.create({
      data: {
        name,
        slug: await this.uniqueSlugFor('category', slugify(name)),
        icon: dto.icon || '📚',
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
      },
    });
    return { id: category.id, name: category.name, slug: category.slug };
  }

  async updateCategory(userId: string, id: string, dto: AdminCategoryInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return { id: updated.id, name: updated.name };
  }

  async removeCategory(userId: string, id: string) {
    await this.assertStaff(userId);
    const count = await this.prisma.courseCategory.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`This category is used by ${count} course(s).`);
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true, id };
  }

  // --- Resources: cheat-sheets, roadmaps, notes ---

  /**
   * The catalogue's short-form half. Kept apart from courses because the two
   * have almost nothing in common on the form: a resource has no level, no
   * price, no curriculum and no duration, and a course has no attachment list.
   */
  async listResources(userId: string) {
    await this.assertStaff(userId);
    const rows = await this.prisma.resource.findMany({
      orderBy: [{ publishedAt: 'desc' }],
      include: {
        category: { select: { name: true, icon: true } },
        lecturer: { select: { name: true } },
        organization: { select: { name: true } },
        tags: true,
        _count: { select: { media: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      slug: r.slug,
      summary: r.summary,
      coverUrl: r.coverUrl,
      isPremium: r.isPremium,
      isFeatured: r.isFeatured,
      viewCount: r.viewCount,
      downloadCount: r.downloadCount,
      mediaCount: r._count.media,
      // A resource whose body and attachments are both empty is a stub the
      // operator started and never finished — worth flagging in the list.
      isEmpty: !r.bodyMd.trim() && r._count.media === 0,
      categoryName: r.category?.name ?? null,
      categoryIcon: r.category?.icon ?? null,
      lecturerName: r.lecturer?.name ?? null,
      organizationName: r.organization?.name ?? null,
      tags: r.tags.map((t) => t.tag),
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
    }));
  }

  /** One resource in the shape the form edits — names, not ids. */
  async getResource(userId: string, slug: string) {
    await this.assertStaff(userId);
    const r = await this.prisma.resource.findUnique({
      where: { slug },
      include: {
        category: true,
        lecturer: true,
        organization: true,
        tags: true,
        media: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('Resource not found');
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      slug: r.slug,
      summary: r.summary ?? '',
      bodyMd: r.bodyMd,
      coverUrl: r.coverUrl,
      categoryName: r.category?.name ?? '',
      lecturerName: r.lecturer?.name ?? '',
      organizationName: r.organization?.name ?? '',
      tags: r.tags.map((t) => t.tag),
      isPremium: r.isPremium,
      isFeatured: r.isFeatured,
      sourceUrl: r.sourceUrl ?? '',
      readMinutes: r.readMinutes,
      viewCount: r.viewCount,
      downloadCount: r.downloadCount,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      media: r.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        url: m.url ?? '',
        fileName: m.fileName ?? '',
        fileSizeMb: m.fileSizeMb,
        caption: m.caption ?? '',
        orderIndex: m.orderIndex,
      })),
    };
  }

  async createResource(userId: string, dto: AdminResourceInput) {
    await this.assertStaff(userId);
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Title is required');
    const type = resourceType(dto.type);
    const refs = await this.resolveResourceRefs(dto);
    const slug = await this.uniqueSlugFor('resource', slugify(title));

    const resource = await this.prisma.resource.create({
      data: {
        type,
        title,
        slug,
        summary: dto.summary?.trim() || null,
        bodyMd: dto.bodyMd ?? '',
        coverUrl: dto.coverUrl || null,
        categoryId: refs.categoryId,
        lecturerId: refs.lecturerId,
        organizationId: refs.organizationId,
        isPremium: dto.isPremium ?? false,
        isFeatured: dto.isFeatured ?? false,
        sourceUrl: dto.sourceUrl?.trim() || null,
        readMinutes: Math.max(0, Math.round(dto.readMinutes ?? 0)),
        tags: { create: cleanTags(dto.tags).map((tag) => ({ tag })) },
        media: { create: mediaRows(dto.media) },
      },
    });
    return { id: resource.id, slug: resource.slug, title: resource.title };
  }

  async updateResource(userId: string, slug: string, dto: AdminResourceInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.resource.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) throw new NotFoundException('Resource not found');
    const refs = await this.resolveResourceRefs(dto, existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.resource.update({
        where: { id: existing.id },
        data: {
          ...(dto.type !== undefined ? { type: resourceType(dto.type) } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary.trim() || null } : {}),
          ...(dto.bodyMd !== undefined ? { bodyMd: dto.bodyMd } : {}),
          ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl || null } : {}),
          ...(dto.categoryName !== undefined ? { categoryId: refs.categoryId } : {}),
          ...(dto.lecturerName !== undefined ? { lecturerId: refs.lecturerId } : {}),
          ...(dto.organizationName !== undefined ? { organizationId: refs.organizationId } : {}),
          ...(dto.isPremium !== undefined ? { isPremium: dto.isPremium } : {}),
          ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
          ...(dto.sourceUrl !== undefined ? { sourceUrl: dto.sourceUrl.trim() || null } : {}),
          ...(dto.readMinutes !== undefined ? { readMinutes: Math.max(0, Math.round(dto.readMinutes)) } : {}),
        },
      });
      // Tags and media are replaced wholesale: the form always posts the full
      // list, and diffing rows the operator can reorder freely buys nothing.
      if (dto.tags !== undefined) {
        await tx.resourceTag.deleteMany({ where: { resourceId: row.id } });
        const tags = cleanTags(dto.tags);
        if (tags.length) {
          await tx.resourceTag.createMany({ data: tags.map((tag) => ({ resourceId: row.id, tag })) });
        }
      }
      if (dto.media !== undefined) {
        await tx.resourceMedia.deleteMany({ where: { resourceId: row.id } });
        const rows = mediaRows(dto.media);
        if (rows.length) {
          await tx.resourceMedia.createMany({ data: rows.map((m) => ({ ...m, resourceId: row.id })) });
        }
      }
      return row;
    });
    return { id: updated.id, slug: updated.slug, title: updated.title };
  }

  /** Soft delete, so a link shared in a channel dies with a 404 and not a gap. */
  async deleteResource(userId: string, slug: string) {
    await this.assertStaff(userId);
    const existing = await this.prisma.resource.findUnique({ where: { slug }, select: { id: true, deletedAt: true } });
    if (!existing) throw new NotFoundException('Resource not found');
    await this.prisma.resource.update({
      where: { id: existing.id },
      data: { deletedAt: existing.deletedAt ? null : new Date() },
    });
    return { id: existing.id, slug, deleted: !existing.deletedAt };
  }

  /**
   * Category, lecturer and publisher resolve by name exactly as they do for a
   * course, so typing "Machine Learning" on a cheat-sheet reuses the category
   * the courses already sit in instead of forking a second one.
   */
  private async resolveResourceRefs(
    dto: AdminResourceInput,
    existing?: { id: string },
  ): Promise<{ categoryId: string | null; lecturerId: string | null; organizationId: string | null }> {
    void existing; // an explicit empty name clears the field; absence leaves it

    let categoryId: string | null = null;
    if (dto.categoryName?.trim()) {
      const name = dto.categoryName.trim();
      const found = await this.prisma.category.findFirst({ where: { name } });
      const cat =
        found ??
        (await this.prisma.category.create({
          data: { name, slug: await this.uniqueSlugFor('category', slugify(name)) },
        }));
      categoryId = cat.id;
    }

    let lecturerId: string | null = null;
    if (dto.lecturerName?.trim()) {
      const name = dto.lecturerName.trim();
      const found = await this.prisma.lecturer.findFirst({ where: { name } });
      const lecturer =
        found ??
        (await this.prisma.lecturer.create({
          data: { name, slug: await this.uniqueSlugFor('lecturer', slugify(name)) },
        }));
      lecturerId = lecturer.id;
    }

    let organizationId: string | null = null;
    if (dto.organizationName?.trim()) {
      const name = dto.organizationName.trim();
      const found = await this.prisma.organization.findFirst({ where: { name } });
      const org =
        found ??
        (await this.prisma.organization.create({
          data: { name, slug: await this.uniqueSlugFor('organization', slugify(name)) },
        }));
      organizationId = org.id;
    }

    return { categoryId, lecturerId, organizationId };
  }

  // --- Legal documents ---

  /**
   * Every document plus how far its current version has spread. `acceptedCurrent`
   * against `eligibleUsers` is the number an operator actually wants after
   * publishing a change: how many people have caught up.
   */
  async listLegal(userId: string) {
    await this.assertStaff(userId);
    const docs = await this.prisma.legalDocument.findMany({
      orderBy: { type: 'asc' },
      include: { updatedBy: { select: { name: true, username: true } } },
    });
    const [eligibleUsers, counts] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.legalAcceptance.groupBy({
        by: ['documentId', 'version'],
        _count: { _all: true },
      }),
    ]);
    return docs.map((d) => ({
      id: d.id,
      type: d.type,
      title: legalTitle(d.type, d.title),
      customTitle: d.title,
      version: d.version,
      bodyMd: d.bodyMd,
      changeSummary: d.changeSummary,
      requiresAcceptance: d.requiresAcceptance,
      effectiveAt: d.effectiveAt,
      updatedAt: d.updatedAt,
      updatedBy: d.updatedBy?.name ?? null,
      acceptedCurrent: counts
        .filter((c) => c.documentId === d.id && c.version === d.version)
        .reduce((s, c) => s + c._count._all, 0),
      acceptedAnyVersion: counts
        .filter((c) => c.documentId === d.id)
        .reduce((s, c) => s + c._count._all, 0),
      eligibleUsers,
    }));
  }

  async createLegal(userId: string, dto: AdminLegalInput) {
    await this.assertStaff(userId);
    const type = dto.type?.trim().toLowerCase();
    if (!type) throw new BadRequestException('A type is required (terms, privacy, refund…)');
    if (!/^[a-z0-9-]+$/.test(type)) {
      throw new BadRequestException('Type may only contain lowercase letters, numbers and dashes');
    }
    if (!dto.bodyMd?.trim()) throw new BadRequestException('The document body cannot be empty');
    const existing = await this.prisma.legalDocument.findUnique({ where: { type } });
    if (existing) throw new BadRequestException(`A “${type}” document already exists — edit that one.`);

    const doc = await this.prisma.legalDocument.create({
      data: {
        type,
        title: dto.title?.trim() || null,
        version: dto.version?.trim() || '1.0',
        bodyMd: dto.bodyMd.trim(),
        changeSummary: dto.changeSummary?.trim() || null,
        requiresAcceptance: dto.requiresAcceptance ?? true,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : new Date(),
        updatedById: userId,
      },
    });
    return { id: doc.id, type: doc.type, version: doc.version, notified: 0 };
  }

  /**
   * Publish an edit.
   *
   * A version change is what invalidates consent — acceptance rows are keyed by
   * version, so bumping it puts the document back in front of everyone. That
   * makes "version changed" and "users are re-prompted" the same event, and this
   * method keeps them inseparable: a republish always notifies, and a minorEdit
   * never changes the version. Letting an admin bump the version quietly would
   * silently revoke everyone's consent with nothing to tell them why.
   */
  async updateLegal(userId: string, type: string, dto: AdminLegalInput) {
    await this.assertStaff(userId);
    const existing = await this.prisma.legalDocument.findUnique({ where: { type } });
    if (!existing) throw new NotFoundException(`No “${type}” document — create it first.`);

    const bodyMd = dto.bodyMd !== undefined ? dto.bodyMd.trim() : existing.bodyMd;
    if (!bodyMd) throw new BadRequestException('The document body cannot be empty');
    const typed = dto.version?.trim();
    const republish = !dto.minorEdit && (bodyMd !== existing.bodyMd || (!!typed && typed !== existing.version));
    const version = dto.minorEdit
      ? existing.version
      : republish
        ? typed || bumpVersion(existing.version)
        : typed || existing.version;
    const requiresAcceptance = dto.requiresAcceptance ?? existing.requiresAcceptance;
    const label = legalTitle(type, dto.title ?? existing.title);
    const summary = dto.changeSummary !== undefined ? dto.changeSummary.trim() : existing.changeSummary;

    const { doc, notified } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.legalDocument.update({
        where: { type },
        data: {
          bodyMd,
          version,
          requiresAcceptance,
          ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
          ...(dto.changeSummary !== undefined ? { changeSummary: summary || null } : {}),
          ...(dto.effectiveAt ? { effectiveAt: new Date(dto.effectiveAt) } : {}),
          ...(republish && !dto.effectiveAt ? { effectiveAt: new Date() } : {}),
          updatedById: userId,
        },
      });

      if (!republish || !requiresAcceptance) return { doc: updated, notified: 0 };

      // Whose agreement just went stale: anyone holding an acceptance for some
      // other version of this document and none for the new one.
      const [previous, current] = await Promise.all([
        tx.legalAcceptance.findMany({
          where: { documentId: updated.id, version: { not: version } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        tx.legalAcceptance.findMany({
          where: { documentId: updated.id, version },
          select: { userId: true },
        }),
      ]);
      const alreadyOnNew = new Set(current.map((r) => r.userId));
      const targets = previous.map((r) => r.userId).filter((id) => !alreadyOnNew.has(id));
      if (targets.length === 0) return { doc: updated, notified: 0 };

      const created = await tx.notification.createMany({
        data: targets.map((target) => ({
          userId: target,
          type: 'legal_update',
          title: `${label} updated`,
          body:
            summary ||
            `We've published version ${version}. Please review and accept the updated ${label.toLowerCase()}.`,
          deepLink: `/legal/${type}`,
        })),
      });
      return { doc: updated, notified: created.count };
    });

    return {
      id: doc.id,
      type: doc.type,
      version: doc.version,
      republished: republish,
      notified,
      message: republish
        ? `${label} published as v${doc.version}${notified > 0 ? ` — ${notified} user${notified === 1 ? '' : 's'} notified to re-accept` : ''}`
        : `${label} saved without a version change — nobody was prompted`,
    };
  }

  // --- helpers ---

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let i = 2;
    while (await this.prisma.course.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${i}`;
      i++;
    }
    return slug;
  }

  private async resolveRefs(
    dto: AdminCourseInput,
    existing?: { id: string },
  ): Promise<{ levelId: string | null; lecturerIds: string[]; organizationId: string | null; categoryIds: string[] }> {
    let levelId: string | null = null;
    if (dto.levelName) {
      const level = await this.prisma.level.upsert({
        where: { name: dto.levelName.trim() },
        update: {},
        create: { name: dto.levelName.trim() },
      });
      levelId = level.id;
    } else if (existing && dto.levelName !== undefined) {
      levelId = null;
    }

    // Every credited teacher, in the order the form lists them; names not on file
    // yet are created, exactly as categories are. Duplicates collapse, so pasting
    // "Andrei Neagoie, Andrei Neagoie" cannot break the composite primary key.
    const lecturerIds: string[] = [];
    const seenLecturers = new Set<string>();
    for (const name of requestedLecturers(dto) ?? []) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seenLecturers.has(key)) continue;
      seenLecturers.add(key);
      const existingLecturer = await this.prisma.lecturer.findFirst({ where: { name: trimmed } });
      const lecturer =
        existingLecturer ??
        (await this.prisma.lecturer.create({
          data: { name: trimmed, slug: await this.uniqueSlugFor('lecturer', slugify(trimmed)) },
        }));
      lecturerIds.push(lecturer.id);
    }

    let organizationId: string | null = null;
    if (dto.organizationName) {
      const trimmed = dto.organizationName.trim();
      const existingOrg = await this.prisma.organization.findFirst({ where: { name: trimmed } });
      const org =
        existingOrg ??
        (await this.prisma.organization.create({
          data: { name: trimmed, slug: await this.uniqueSlugFor('organization', slugify(trimmed)) },
        }));
      organizationId = org.id;
    } else if (existing && dto.organizationName !== undefined) {
      organizationId = null;
    }

    const categoryIds: string[] = [];
    for (const name of dto.categoryNames ?? []) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const existingCat = await this.prisma.category.findFirst({ where: { name: trimmed } });
      const category =
        existingCat ??
        (await this.prisma.category.create({
          data: { name: trimmed, slug: await this.uniqueSlugFor('category', slugify(trimmed)) },
        }));
      categoryIds.push(category.id);
    }
    return { levelId, lecturerIds, organizationId, categoryIds };
  }

  /** Slug is the only unique field on Category/Lecturer/Organization — generate one. */
  private async uniqueSlugFor(
    model: 'category' | 'lecturer' | 'organization' | 'resource',
    base: string,
  ): Promise<string> {
    let slug = base;
    let i = 2;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = this.prisma[model] as any;
    while (await table.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${i}`;
      i++;
    }
    return slug;
  }

  // ---------------------------------------------------------------
  // Direct uploads
  // ---------------------------------------------------------------

  /**
   * Hand the browser a Cloudinary signature so the file never passes through
   * this API. Staff-only: an upload spends storage and bandwidth, and the
   * public avatar path (`POST /images/upload`) already covers ordinary users.
   */
  async signUpload(userId: string, kind: UploadKind) {
    await this.assertStaff(userId);
    try {
      return this.cloudinary.signUpload(kind);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Could not sign the upload');
    }
  }

  // ---------------------------------------------------------------
  // Telegram bridge — the bot's file commands, driven from the console
  // ---------------------------------------------------------------

  /**
   * Reading an existing Telegram message means forwarding it somewhere the bot
   * can post, so every web-driven link needs one operator's DM as scratch
   * space. That is what pairing buys, and why these calls fail with an
   * actionable message rather than a 500 when the operator hasn't paired.
   */
  private async operatorChat(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (!user?.telegramId) {
      throw new BadRequestException(
        'Connect your Telegram account first — open Admin → Telegram and tap Connect Telegram.',
      );
    }
    return { chatId: Number(user.telegramId), telegramUserId: user.telegramId };
  }

  private async courseBySlug(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, slug: true, deletedAt: true },
    });
    if (!course || course.deletedAt) throw new NotFoundException('Course not found');
    return course;
  }

  /** Bot health, this operator's pairing state, and the pending forwarded file. */
  async telegramConsole(userId: string) {
    await this.assertStaff(userId);
    const [status, user] = await Promise.all([
      this.telegram.botStatus(),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true, telegramUsername: true },
      }),
    ]);
    const forwarded = user?.telegramId ? await this.telegram.forwardedFile(user.telegramId) : null;
    return {
      ...status,
      paired: Boolean(user?.telegramId),
      telegramUsername: user?.telegramUsername ?? null,
      pairingLink: this.telegram.pairingLink(userId),
      forwarded: forwarded
        ? { fileName: forwarded.fileName, fileSizeMb: forwarded.fileSizeMb, at: forwarded.updatedAt }
        : null,
    };
  }

  /** The files attached to a course, grouped into modules. */
  async courseTelegramFiles(userId: string, slug: string) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    const modules = await this.telegram.courseFiles(course.id);
    return {
      modules: modules.map((m) => ({
        title: m.title,
        order: m.order,
        sizeMb: Number(m.sizeMb.toFixed(1)),
        files: m.files.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          fileSizeMb: f.fileSizeMb,
          partIndex: f.partIndex,
          chatUsername: f.chatUsername,
          messageId: String(f.fileMessageId),
          hasFileId: Boolean(f.fileId),
          createdAt: f.createdAt,
        })),
      })),
    };
  }

  /** `/link <t.me link> <slug>` from the web. */
  async attachTelegramLink(userId: string, slug: string, url: string) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    const { chatId } = await this.operatorChat(userId);
    const res = await this.telegram.attachFromMessageLink(course.id, url, chatId);
    if (!res.ok) throw new BadRequestException(ATTACH_ERRORS[res.code](res.detail));
    return { attached: true, created: res.created, fileName: res.fileName, fileSizeMb: res.fileSizeMb };
  }

  /** `/link <slug>` with a file already forwarded to the bot. */
  async attachForwardedFile(userId: string, slug: string) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    const { chatId, telegramUserId } = await this.operatorChat(userId);
    const res = await this.telegram.attachForwardedFile({ courseId: course.id, telegramUserId, viaChatId: chatId });
    if (!res.ok) {
      throw new BadRequestException(
        'No forwarded file waiting. Send or forward the ZIP to the bot in Telegram, then try again.',
      );
    }
    return { attached: true, created: res.created, fileName: res.fileName, fileSizeMb: res.fileSizeMb };
  }

  /** `/import <channel> <from>-<to> <slug>` from the web. */
  async importTelegramRange(
    userId: string,
    slug: string,
    input: { channel: string; from: number; to: number },
  ) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    const { chatId } = await this.operatorChat(userId);
    // Whatever was pasted is handed to the bot as-is: parseChatRef there is the
    // single place that knows @name from a t.me link from a -100 id. Stripping
    // only "@" and "https://t.me/" here is what turned a copied message link
    // into the unresolvable chat "@syncourse/2".
    const channel = input.channel.trim();
    const ref = parseChatRef(channel);
    if (!ref) {
      throw new BadRequestException(
        'Which channel? Give its @username, a link to any message in it (https://t.me/name/41), ' +
          'or its numeric id (-1001234567890).',
      );
    }
    if (!Number.isInteger(input.from) || !Number.isInteger(input.to) || input.from < 1) {
      throw new BadRequestException('The message ids must be whole numbers.');
    }
    if (input.to < input.from) throw new BadRequestException('The range end must not be before the start.');
    if (input.to - input.from + 1 > MAX_IMPORT_RANGE) {
      throw new BadRequestException(
        `That range is ${input.to - input.from + 1} messages — import at most ${MAX_IMPORT_RANGE} at a time.`,
      );
    }
    const res = await this.telegram.importFilesFromChannel({
      courseId: course.id,
      channel,
      from: input.from,
      to: input.to,
      viaChatId: chatId,
    });
    if (!res.ok) throw new BadRequestException(res.error);
    return res;
  }

  /** Detach one file, or every file when `linkId` is omitted. */
  async removeTelegramFile(userId: string, slug: string, linkId?: string) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    if (!linkId) return { removed: await this.telegram.unlinkAllFiles(course.id) };
    const gone = await this.telegram.unlinkFile(course.id, linkId);
    if (!gone) throw new NotFoundException('That file is already detached');
    return { removed: 1 };
  }

  /** Send the course's files to the operator's own DM, to check delivery works. */
  async testTelegramDelivery(userId: string, slug: string) {
    await this.assertStaff(userId);
    const course = await this.courseBySlug(slug);
    const { chatId } = await this.operatorChat(userId);
    await this.telegram.deliverCourseTo(chatId, course.slug);
    return { sent: true };
  }

  /** `/broadcast` from the web. Reaches paired accounts only. */
  async broadcastTelegram(userId: string, text: string) {
    await this.assertStaff(userId);
    const body = text.trim();
    if (body.length < 4) throw new BadRequestException('Write the announcement first.');
    if (body.length > 3000) throw new BadRequestException('Telegram caps a message at about 4000 characters.');
    return this.telegram.broadcastToLinkedUsers(body);
  }
}

/** Same wording the bot uses, so an operator gets one explanation, not two. */
const ATTACH_ERRORS: Record<string, (detail?: string) => string> = {
  unparsable: () => 'That does not look like a t.me message link. Tap a file in Telegram → Copy Link.',
  unresolved: (d) => `Could not find that chat: ${d ?? 'unknown'}. Check the @username.`,
  unreachable: (d) =>
    `The bot cannot read that message (${d ?? 'not found'}). Add it to the chat — as an admin if it is a channel — ` +
    'or forward the file to the bot and use "Attach forwarded file" instead.',
  nofile: () => 'That message has no file attached (document, video or audio).',
};

/** Telegram is read one message at a time, so a big range means a long request. */
const MAX_IMPORT_RANGE = 200;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'course';
}

const RESOURCE_TYPES = ['cheat-sheet', 'roadmap', 'note'];

/** Anything unrecognised becomes a cheat-sheet rather than a row nothing lists. */
function resourceType(type?: string): string {
  const t = type?.trim();
  return t && RESOURCE_TYPES.includes(t) ? t : 'cheat-sheet';
}

const MEDIA_KINDS = [
  'image',
  'video',
  'audio',
  'pdf',
  'doc',
  'sheet',
  'slide',
  'archive',
  'code',
  'link',
  'other',
];

/**
 * Which viewer a client should reach for. The operator picks this in the form,
 * but a URL pasted without one still lands somewhere sensible.
 */
function mediaKind(kind: string | undefined, url: string): string {
  const k = kind?.trim().toLowerCase();
  if (k && MEDIA_KINDS.includes(k)) return k;
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'ogg', 'wav'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf', 'txt', 'md'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx'].includes(ext)) return 'slide';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  return url ? 'link' : 'other';
}

function cleanTags(tags?: string[]): string[] {
  const seen = new Set<string>();
  for (const t of tags ?? []) {
    const trimmed = t.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * The teachers a request is asking for, whichever field it used: `lecturerNames`
 * from a current client, `lecturerName` from one that predates co-teaching.
 * `undefined` means the request never mentioned teachers, so the existing
 * credits must be left alone — an empty array means "clear them".
 */
function requestedLecturers(dto: AdminCourseInput): string[] | undefined {
  if (dto.lecturerNames !== undefined) return cleanTags(dto.lecturerNames);
  if (dto.lecturerName !== undefined) return cleanTags([dto.lecturerName]);
  return undefined;
}

/** Drop blank rows, normalise the kind, and let list order set orderIndex. */
function mediaRows(media?: AdminResourceMediaInput[]) {
  return (media ?? [])
    .filter((m) => (m.url ?? '').trim() || (m.caption ?? '').trim())
    .map((m, i) => {
      const url = (m.url ?? '').trim();
      return {
        kind: mediaKind(m.kind, url),
        url: url || null,
        fileName: m.fileName?.trim() || (url ? labelFromUrl(url) : null),
        fileSizeMb: typeof m.fileSizeMb === 'number' && m.fileSizeMb > 0 ? m.fileSizeMb : null,
        caption: m.caption?.trim() || null,
        orderIndex: i,
      };
    });
}

function fileTypeOf(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop() ?? '';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'zip') return 'application/zip';
    if (ext === 'pdf') return 'application/pdf';
    if (['mp4', 'mkv', 'webm'].includes(ext)) return `video/${ext}`;
    if (['mp3', 'm4a'].includes(ext)) return `audio/${ext}`;
    return ext ? `application/${ext}` : 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

function labelFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').trim();
    return name || 'Course file';
  } catch {
    return 'Course file';
  }
}
