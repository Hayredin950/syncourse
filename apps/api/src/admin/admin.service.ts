import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
        lecturer: true,
        organization: true,
        _count: { select: { sections: true, enrollments: true } },
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
      enrollmentCount: c.enrollmentCount,
      deleted: c.deletedAt !== null,
      sectionCount: c._count.sections,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      level: c.level?.name ?? null,
      lecturer: c.lecturer?.name ?? null,
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
        lecturer: true,
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
      lecturerName: course.lecturer?.name ?? null,
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
    const { levelId, lecturerId, organizationId, categoryIds } = await this.resolveRefs(dto);

    const course = await this.prisma.$transaction(async (tx) => {
      const c = await tx.course.create({
        data: {
          title,
          slug,
          description,
          language: dto.language || 'English',
          levelId,
          lecturerId,
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

    const { levelId, lecturerId, organizationId, categoryIds } = await this.resolveRefs(dto, existing);

    const data: Prisma.CourseUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.levelName !== undefined ? { level: levelId ? { connect: { id: levelId } } : { disconnect: true } } : {}),
      ...(dto.lecturerName !== undefined
        ? { lecturer: lecturerId ? { connect: { id: lecturerId } } : { disconnect: true } }
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

  /** Soft-delete a course (keeps enrolled users' progress history intact). */
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
          select: { enrollments: true, reviews: true, lists: true },
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
      enrollments: u._count.enrollments,
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
      include: { _count: { select: { courses: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      photoUrl: l.photoUrl,
      bio: l.bio,
      credentials: l.credentials,
      courseCount: l._count.courses,
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
    const count = await this.prisma.course.count({ where: { lecturerId: id, deletedAt: null } });
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
  ): Promise<{ levelId: string | null; lecturerId: string | null; organizationId: string | null; categoryIds: string[] }> {
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

    let lecturerId: string | null = null;
    if (dto.lecturerName) {
      const trimmed = dto.lecturerName.trim();
      const existingLecturer = await this.prisma.lecturer.findFirst({ where: { name: trimmed } });
      const lecturer =
        existingLecturer ??
        (await this.prisma.lecturer.create({
          data: { name: trimmed, slug: await this.uniqueSlugFor('lecturer', slugify(trimmed)) },
        }));
      lecturerId = lecturer.id;
    } else if (existing && dto.lecturerName !== undefined) {
      lecturerId = null;
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
    return { levelId, lecturerId, organizationId, categoryIds };
  }

  /** Slug is the only unique field on Category/Lecturer/Organization — generate one. */
  private async uniqueSlugFor(
    model: 'category' | 'lecturer' | 'organization',
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
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'course';
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
