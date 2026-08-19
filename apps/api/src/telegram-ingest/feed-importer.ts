/**
 * feed-importer.ts
 *
 * Writes a `ParsedFeed` (from telegram-feed.parser.ts) into the database as:
 *
 *     Organization (channel) → Course → Section (module) → Lesson (part)
 *
 * The importer is idempotent: courses are matched by slug and re-importing a
 * channel simply updates metadata and rebuilds that course's sections/lessons.
 */
import { PrismaClient } from '@prisma/client';
import { ParsedFeed, ParsedCourse, ParsedSection, slugify } from './telegram-feed.parser';

export interface ImportOptions {
  /** Extra categories (by slug) attached to every course from this feed. */
  categorySlugs?: string[];
  /** Import at most N courses (newest announcements first after sorting). */
  maxCourses?: number;
  /** How many t.me preview pages to fetch when scraping a channel. */
  maxPages?: number;
  /** When true, only count what *would* be written — no DB writes. */
  dryRun?: boolean;
  /** Used to build t.me fallback links for pasted transcripts. */
  channelUsername?: string | null;
  /** Display name used when creating the Organization from a paste. */
  channelTitle?: string | null;
}

export interface ImportResult {
  organization: { id: string; name: string; slug: string } | null;
  coursesCreated: number;
  coursesUpdated: number;
  sectionsCreated: number;
  lessonsCreated: number;
  attachmentsCreated: number;
  lecturersCreated: number;
  categoriesAssigned: number;
  telegramLinks: number;
  courses: Array<{ slug: string; title: string; modules: number; lessons: number }>;
}

/** hashtag (#python, #web, #design …) → category slug */
const HASHTAG_CATEGORY: Record<string, string> = {
  web: 'web-development',
  webdevelopment: 'web-development',
  development: 'web-development',
  javascript: 'web-development',
  react: 'web-development',
  node: 'web-development',
  nodejs: 'web-development',
  vue: 'web-development',
  html: 'web-development',
  css: 'web-development',
  flask: 'web-development',
  django: 'web-development',
  graphql: 'web-development',
  ml: 'ai-and-machine-learning',
  ai: 'ai-and-machine-learning',
  python: 'programming',
  blockchain: 'programming',
  datascience: 'data-science',
  data_science: 'data-science',
  design: 'design',
  figma: 'design',
  ux: 'design',
  ui: 'design',
  android: 'mobile-development',
  flutter: 'mobile-development',
  devops: 'devops-and-cloud',
  cloud: 'devops-and-cloud',
  linux: 'devops-and-cloud',
  network: 'cybersecurity-and-it',
  security: 'cybersecurity-and-it',
  it_and_software: 'cybersecurity-and-it',
  business: 'business',
  finance: 'business',
};

/** channel username → default category slug (used when a post has no hashtags) */
const CHANNEL_DEFAULT_CATEGORY: Record<string, string> = {
  machine_learning_courses: 'ai-and-machine-learning',
  zero_to_mastery: 'web-development',
  webdev_trainings: 'web-development',
  javascript_trainings: 'web-development',
  learnpython3: 'programming',
  linuxmastery: 'cybersecurity-and-it',
  react_training: 'web-development',
};

/** display names for known category slugs (created from feed imports) */
const CATEGORY_NAMES: Record<string, string> = {
  'ai-and-machine-learning': 'AI & Machine Learning',
  'web-development': 'Web Development',
  'data-science': 'Data Science',
  'mobile-development': 'Mobile Development',
  'devops-and-cloud': 'DevOps & Cloud',
  'cybersecurity-and-it': 'Cybersecurity & IT',
  business: 'Business',
  programming: 'Programming',
  design: 'Design',
};

const stripExt = (name: string) => name.replace(/\.(zip|rar|7z|tar|gz|pdf|mp4|mkv|torrent|iso)$/i, '');
const pad2 = (n: number) => String(n).padStart(2, '0');

export class FeedImporter {
  constructor(private readonly prisma: PrismaClient) {}

  async importFeed(feed: ParsedFeed, opts: ImportOptions = {}): Promise<ImportResult> {
    const result: ImportResult = {
      organization: null,
      coursesCreated: 0,
      coursesUpdated: 0,
      sectionsCreated: 0,
      lessonsCreated: 0,
      attachmentsCreated: 0,
      lecturersCreated: 0,
      categoriesAssigned: 0,
      telegramLinks: 0,
      courses: [],
    };

    const channelUsername = opts.channelUsername ?? feed.channelUsername;
    let org: Awaited<ReturnType<FeedImporter['getOrCreateOrganization']>> | null = null;
    if (channelUsername) {
      org = await this.getOrCreateOrganization(channelUsername, feed.channelTitle, feed.subscribers);
      result.organization = org ? { id: org.id, name: org.name, slug: org.slug } : null;
    }

    const defaultCategories = new Set<string>(opts.categorySlugs ?? []);
    if (channelUsername && CHANNEL_DEFAULT_CATEGORY[channelUsername]) {
      defaultCategories.add(CHANNEL_DEFAULT_CATEGORY[channelUsername]);
    }

    let courses = feed.courses;
    if (opts.maxCourses && opts.maxCourses > 0) {
      courses = feed.courses
        .slice()
        .sort((a, b) => (b.announcedAt?.getTime() ?? 0) - (a.announcedAt?.getTime() ?? 0))
        .slice(0, opts.maxCourses);
    }

    for (const pc of courses) {
      if (opts.dryRun) {
        const lessons = pc.sections.reduce((n, s) => n + s.parts.length, 0);
        result.courses.push({ slug: pc.slug, title: pc.title, modules: pc.sections.length, lessons });
        continue;
      }
      await this.importCourse(pc, channelUsername, defaultCategories, result);
    }

    return result;
  }


  // ----------------------------------------------------------------
  // one course
  // ----------------------------------------------------------------

  private async importCourse(
    pc: ParsedCourse,
    channelUsername: string | null,
    defaultCategories: Set<string>,
    result: ImportResult,
  ) {
    const slug = await this.uniqueCourseSlug(pc.slug, pc.title);
    const existing = await this.prisma.course.findUnique({ where: { slug } });
    const lecturer = pc.taughtBy[0] ? await this.getOrCreateLecturer(pc.taughtBy[0]) : null;
    if (pc.taughtBy[0] && !lecturer) result.lecturersCreated++;

    const course = await this.prisma.course.upsert({
      where: { slug },
      create: {
        slug,
        title: pc.title,
        description: pc.description || `${pc.title} — added from the ${channelUsername ?? 'Telegram'} feed.`,
        organizationId: result.organization?.id ?? null,
        lecturerId: lecturer?.id ?? null,
        ratingAvg: pc.ratingAvg ?? 0,
        ratingCount: pc.ratingCount ?? 0,
        originalPrice: pc.originalPrice ?? null,
        sourceUrl: pc.sourceUrl ?? null,
        publishedAt: pc.announcedAt ?? new Date(),
        isPremium: false,
        isFeatured: false,
      },
      update: {
        title: pc.title,
        description: pc.description || undefined,
        organizationId: result.organization?.id ?? null,
        lecturerId: lecturer?.id ?? null,
        ratingAvg: pc.ratingAvg ?? undefined,
        ratingCount: pc.ratingCount ?? undefined,
        originalPrice: pc.originalPrice ?? undefined,
        sourceUrl: pc.sourceUrl ?? undefined,
      },
    });

    if (existing) result.coursesUpdated++;
    else result.coursesCreated++;

    // categories
    const catSlugs = new Set(defaultCategories);
    for (const h of pc.hashtags) {
      const mapped = HASHTAG_CATEGORY[h.toLowerCase()];
      if (mapped) catSlugs.add(mapped);
    }
    for (const slug of catSlugs) {
      const cat = await this.getOrCreateCategory(slug);
      if (!cat) continue;
      const link = await this.prisma.courseCategory.findUnique({
        where: { courseId_categoryId: { courseId: course.id, categoryId: cat.id } },
      });
      if (!link) {
        await this.prisma.courseCategory.create({ data: { courseId: course.id, categoryId: cat.id } });
        result.categoriesAssigned++;
      }
    }

    // sections → lessons → attachments (module/part mapping)
    if (pc.sections.length > 0) {
      await this.replaceContent(course.id, pc.sections, channelUsername, pc.durationMin ?? 0, result);
    }

    // TelegramCourseLink from the "Download Full Course" link
    if (pc.sourceUrl) {
      const ok = await this.upsertTelegramLink(course.id, pc.sourceUrl);
      if (ok) result.telegramLinks++;
    }

    result.courses.push({
      slug,
      title: pc.title,
      modules: pc.sections.length,
      lessons: pc.sections.reduce((n, s) => n + s.parts.length, 0),
    });
  }


  // ----------------------------------------------------------------
  // sections / lessons / attachments
  // ----------------------------------------------------------------

  private async replaceContent(
    courseId: string,
    sections: ParsedSection[],
    channelUsername: string | null,
    totalDurationMin: number,
    result: ImportResult,
  ) {
    await this.prisma.attachment.deleteMany({ where: { courseId } });
    await this.prisma.lesson.deleteMany({ where: { courseId } });
    await this.prisma.section.deleteMany({ where: { courseId } });

    // distribute the announced "⏱ N Hours" across the parts so the catalog's
    // computed durationMin/lessonCount match the channel's own numbers
    const partCount = sections.reduce((n, s) => n + s.parts.length, 0);
    const perLessonSec = partCount > 0 ? Math.round((totalDurationMin * 60) / partCount) : 0;

    for (const sec of sections) {
      const section = await this.prisma.section.create({
        data: { courseId, title: sec.title, orderIndex: sec.orderIndex },
      });
      result.sectionsCreated++;

      for (const [idx, part] of sec.parts.entries()) {
        const multi = sec.parts.length > 1;
        const title = multi ? `Part ${pad2(part.partNo ?? idx + 1)}` : stripExt(part.fileName);
        const link =
          part.link ??
          (part.postId
            ? `https://t.me/${part.postId}`
            : channelUsername
              ? `https://t.me/${channelUsername}/${part.orderIndex}`
              : null);

        const lesson = await this.prisma.lesson.create({
          data: {
            courseId,
            sectionId: section.id,
            title,
            orderIndex: idx,
            type: 'video',
            durationSec: perLessonSec,
            sourceUrl: link,
            isPreview: false,
          },
        });
        result.lessonsCreated++;

        await this.prisma.attachment.create({
          data: {
            lessonId: lesson.id,
            courseId,
            fileUrl: link ?? part.fileName,
            fileType: part.fileName.includes('.') ? part.fileName.split('.').pop()!.toLowerCase() : 'zip',
            sizeMb: 0,
          },
        });
        result.attachmentsCreated++;
      }
    }
  }

  // ----------------------------------------------------------------
  // upsert helpers
  // ----------------------------------------------------------------

  private async getOrCreateOrganization(username: string, title: string | null, subscribers: number | null) {
    const slug = slugify(username.replace('@', ''));
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      if (subscribers && existing.subscribers !== subscribers) {
        return this.prisma.organization.update({ where: { id: existing.id }, data: { subscribers } });
      }
      return existing;
    }
    return this.prisma.organization.create({
      data: { slug, name: title ?? username, description: null, subscribers: subscribers ?? 0 },
    });
  }

  private async getOrCreateLecturer(name: string) {
    const slug = slugify(name);
    const existing = await this.prisma.lecturer.findUnique({ where: { slug } });
    if (existing) return existing;
    return this.prisma.lecturer.create({
      data: { slug, name, bio: null, credentials: null, socialLinks: JSON.stringify({}) },
    });
  }

  private async getOrCreateCategory(slug: string) {
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) return existing;
    const name =
      CATEGORY_NAMES[slug] ??
      slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    return this.prisma.category.create({ data: { slug, name, icon: '📚', sortOrder: 99 } });
  }

  private async uniqueCourseSlug(base: string, title: string): Promise<string> {
    let slug = base || slugify(title);
    let n = 2;
    let existing = await this.prisma.course.findUnique({ where: { slug } });
    while (existing && existing.title !== title) {
      slug = `${base}-${n++}`;
      existing = await this.prisma.course.findUnique({ where: { slug } });
    }
    return slug;
  }

  private async upsertTelegramLink(courseId: string, sourceUrl: string): Promise<boolean> {
    const m = sourceUrl.match(/t\.me\/([a-zA-Z0-9_]{3,})\/(\d+)/);
    if (!m) return false;
    const [, chatUsername, messageId] = m;
    // A course now has many files, so identity is the source message rather
    // than the course — re-importing the same feed updates that row instead of
    // creating duplicates, and other files stay attached.
    const existing = await this.prisma.telegramCourseLink.findFirst({
      where: { courseId, fileMessageId: BigInt(messageId) },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.telegramCourseLink.update({
        where: { id: existing.id },
        data: { chatUsername },
      });
      return true;
    }
    await this.prisma.telegramCourseLink.create({
      data: {
        courseId,
        chatId: BigInt(0), // unknown for public links — resolve via getChat when the bot joins
        chatUsername,
        fileMessageId: BigInt(messageId),
        fileId: null,
        fileName: null,
        fileSizeMb: null,
      },
    });
    return true;
  }
}
