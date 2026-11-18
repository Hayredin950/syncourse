/**
 * actions.service.ts
 *
 * The assistant's write path. It exists because "ask about the catalogue" and
 * "add something to the catalogue" are different permissions, and mixing them
 * silently is how a chat message deletes a course.
 *
 * Every write is two calls:
 *
 *   1. `propose` parses the instruction, validates it against the database, and
 *      returns a short human summary plus a signed, expiring token. Nothing is
 *      written.
 *   2. `confirm` verifies the token, re-checks the caller, and executes exactly
 *      what the summary said.
 *
 * Parsing is deliberately deterministic rather than model-generated. A course
 * title, an instructor and a price are structured data; a creative
 * reinterpretation of them is a bug, not a feature.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { IngestDraftService } from '../telegram-ingest/draft.service';
import { slugify } from '../telegram-ingest/telegram-feed.parser';
import {
  isTelegramLink,
  parseInstruction,
  summarize,
  type ActionFields,
  type ActionKind,
} from './action-parser';

export interface ActionProposal {
  kind: ActionKind | 'none';
  /** Shown to the operator before they confirm. */
  summary: string;
  fields: ActionFields;
  token: string | null;
  /** Help text when the sentence could not be mapped to an action. */
  reply?: string;
}

interface TokenPayload {
  /** user id */
  u: string;
  /** action */
  a: ActionKind;
  /** fields */
  f: ActionFields;
  /** expiry, unix seconds */
  e: number;
}

const TOKEN_TTL_SECONDS = 10 * 60;

@Injectable()
export class AssistantActionsService {
  private readonly logger = new Logger('AssistantActions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly drafts: IngestDraftService,
  ) {}

  private secret(): string {
    return (
      process.env.ASSISTANT_ACTION_SECRET ??
      process.env.JWT_SECRET ??
      process.env.AUTH_SECRET ??
      'syncourse-assistant-actions'
    );
  }

  private sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  private verify(token: string): TokenPayload {
    const [body, mac] = token.split('.');
    if (!body || !mac) throw new BadRequestException('That confirmation is malformed');
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('That confirmation is not valid');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload?.u || !payload?.a || !payload?.f) throw new BadRequestException('That confirmation is incomplete');
    if (payload.e < Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('That confirmation expired — ask again');
    }
    return payload;
  }

  private async assertStaff(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isStaff: true, telegramId: true },
    });
    if (!user?.isStaff) throw new ForbiddenException('Staff access required');
  }

  // ---------------------------------------------------------------
  // 1. Propose
  // ---------------------------------------------------------------

  async propose(userId: string, instruction: string): Promise<ActionProposal> {
    await this.assertStaff(userId);
    const parsed = parseInstruction(instruction);
    if (!parsed) {
      return {
        kind: 'none',
        summary: '',
        fields: {},
        token: null,
        reply:
          `I can perform these writes, but only when the instruction is unambiguous:\n\n` +
          `• create course Title | Instructor | Category | price\n` +
          `• create course "Title" by Instructor\n` +
          `• create resource Title | body | roadmap\n` +
          `• attach t.me/group/123 to course-slug\n` +
          `• publish draft ab12cd34\n\n` +
          `Nothing is written until you confirm the summary I show.`,
      };
    }

    const validated = await this.validate(parsed.kind, parsed.fields);
    const token = this.sign({
      u: userId,
      a: parsed.kind,
      f: validated,
      e: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    });
    return {
      kind: parsed.kind,
      summary: summarize(parsed.kind, validated),
      fields: validated,
      token,
    };
  }

  /** Check the instruction against the real catalogue before promising it. */
  private async validate(kind: ActionKind, fields: ActionFields): Promise<ActionFields> {
    if (kind === 'create_course') {
      if ((fields.title ?? '').trim().length < 3) throw new BadRequestException('A course needs a title');
      if ((fields.instructor ?? '').trim().length < 2) {
        throw new BadRequestException('A course needs an instructor');
      }
      return {
        ...fields,
        title: fields.title!.trim().slice(0, 200),
        instructor: fields.instructor!.trim().slice(0, 200),
        contentType: fields.contentType === 'mini-course' ? 'mini-course' : 'course',
      };
    }

    if (kind === 'create_resource') {
      if ((fields.title ?? '').trim().length < 3) throw new BadRequestException('A resource needs a title');
      return {
        ...fields,
        title: fields.title!.trim().slice(0, 200),
        resourceType: ['roadmap', 'note'].includes((fields.resourceType ?? '').toLowerCase())
          ? fields.resourceType!.toLowerCase()
          : 'cheat-sheet',
      };
    }

    if (kind === 'attach_file') {
      if (!isTelegramLink(fields.url ?? '')) throw new BadRequestException('Send a t.me message link');
      const course = await this.prisma.course.findUnique({
        where: { slug: fields.slug ?? '' },
        select: { id: true, title: true, deletedAt: true },
      });
      if (!course || course.deletedAt) throw new NotFoundException(`No course with slug "${fields.slug}"`);
      return fields;
    }

    if (kind === 'publish_draft') {
      const draft = await this.drafts.find(fields.draftId ?? '');
      if (draft.status !== 'pending') throw new BadRequestException(`That draft is already ${draft.status}`);
      return fields;
    }

    throw new BadRequestException('Unsupported action');
  }

  // ---------------------------------------------------------------
  // 2. Confirm
  // ---------------------------------------------------------------

  async confirm(userId: string, token: string) {
    const payload = this.verify(token);
    if (payload.u !== userId) throw new ForbiddenException('That confirmation belongs to another account');
    await this.assertStaff(userId);

    switch (payload.a) {
      case 'create_course':
        return this.createCourse(payload.f);
      case 'create_resource':
        return this.createResource(payload.f);
      case 'attach_file':
        return this.attachFile(userId, payload.f);
      case 'publish_draft':
        return this.publishDraft(userId, payload.f);
      default:
        throw new BadRequestException('Unsupported action');
    }
  }

  private async createCourse(fields: ActionFields) {
    const title = fields.title!.trim();
    const names = fields.instructor!
      .split(/[,&/]/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 4);

    const lecturerIds: string[] = [];
    for (const name of names) {
      const lecturer = await this.prisma.lecturer.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name), socialLinks: '{}' },
        select: { id: true },
      });
      if (!lecturerIds.includes(lecturer.id)) lecturerIds.push(lecturer.id);
    }

    const category = (fields.category ?? '').trim();
    let categoryId: string | null = null;
    if (category) {
      const slug = slugify(category) || category.toLowerCase();
      const row = await this.prisma.category.upsert({
        where: { slug },
        update: {},
        create: {
          name: category.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60),
          slug,
          icon: '📚',
        },
        select: { id: true },
      });
      categoryId = row.id;
    }

    const slug = await this.uniqueCourseSlug(slugify(title) || 'course', title);
    const course = await this.prisma.course.create({
      data: {
        title,
        slug,
        description:
          fields.description?.trim() ||
          `${title} — added from the study assistant. Edit this description in Admin → Courses.`,
        lecturerId: lecturerIds[0] ?? null,
        lecturers: { create: lecturerIds.map((lecturerId, i) => ({ lecturerId, orderIndex: i })) },
        price: fields.price ?? null,
        originalPrice: fields.price ?? null,
        contentType: fields.contentType ?? 'course',
        publishedAt: new Date(),
        ...(categoryId ? { categories: { create: [{ categoryId }] } } : {}),
      },
      select: { id: true, slug: true, title: true },
    });

    this.logger.log(`assistant created course ${course.slug}`);
    return {
      ok: true as const,
      kind: 'create_course' as const,
      message: `Course “${course.title}” is live. Add its files from the course page or with /link in the bot.`,
      slug: course.slug,
      url: `/courses/${course.slug}`,
    };
  }

  private async createResource(fields: ActionFields) {
    const title = fields.title!.trim();
    const slug = await this.uniqueResourceSlug(slugify(title) || 'resource', title);
    const body = fields.body?.trim() ?? '';
    const resource = await this.prisma.resource.create({
      data: {
        type: fields.resourceType ?? 'cheat-sheet',
        title,
        slug,
        summary: body.slice(0, 200) || null,
        bodyMd: body,
        publishedAt: new Date(),
        ...(isTelegramLink(fields.url ?? '')
          ? {
              media: {
                create: [{ kind: 'link', url: fields.url, caption: title, orderIndex: 0 }],
              },
            }
          : {}),
      },
      select: { id: true, slug: true, title: true },
    });

    this.logger.log(`assistant created resource ${resource.slug}`);
    return {
      ok: true as const,
      kind: 'create_resource' as const,
      message: `Resource “${resource.title}” is live under Resources.`,
      slug: resource.slug,
      url: `/resources/${resource.slug}`,
    };
  }

  private async attachFile(userId: string, fields: ActionFields) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
    if (!user?.telegramId) {
      throw new BadRequestException(
        'Connect Telegram first — send /start to the bot, then sign in again so I can reach the file.',
      );
    }
    const course = await this.prisma.course.findUnique({
      where: { slug: fields.slug ?? '' },
      select: { id: true, title: true, slug: true },
    });
    if (!course) throw new NotFoundException(`No course with slug "${fields.slug}"`);

    const result = await this.telegram.attachFromMessageLink(
      course.id,
      fields.url!,
      Number(user.telegramId),
    );
    if (!result.ok) {
      throw new BadRequestException(`Could not attach that file (${result.code})${result.detail ? `: ${result.detail}` : ''}`);
    }
    return {
      ok: true as const,
      kind: 'attach_file' as const,
      message: `${result.fileName ?? 'File'} ${result.created ? 'attached' : 'was already attached'} to “${course.title}”.`,
      slug: course.slug,
      url: `/courses/${course.slug}`,
    };
  }

  private async publishDraft(userId: string, fields: ActionFields) {
    const result = await this.drafts.approve(fields.draftId ?? '', { userId });
    const slug = result.course?.slug ?? result.resource?.slug ?? '';
    const title = result.course?.title ?? result.resource?.title ?? 'Draft';
    return {
      ok: true as const,
      kind: 'publish_draft' as const,
      message: `Published “${title}”${result.filesAdded ? ` with ${result.filesAdded} file(s)` : ''}.`,
      slug,
      url: result.course ? `/courses/${slug}` : `/resources/${slug}`,
    };
  }

  private async uniqueCourseSlug(base: string, title: string): Promise<string> {
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.prisma.course.findUnique({ where: { slug }, select: { title: true } });
      if (!existing || existing.title === title) return slug;
      slug = `${base}-${n++}`;
    }
  }

  private async uniqueResourceSlug(base: string, title: string): Promise<string> {
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.prisma.resource.findUnique({ where: { slug }, select: { title: true } });
      if (!existing || existing.title === title) return slug;
      slug = `${base}-${n++}`;
    }
  }
}
