/**
 * draft.service.ts
 *
 * Turns what people post in the source Telegram group into a reviewed course,
 * without letting the bot publish anything on its own.
 *
 * Two writers touch `IngestDraft`:
 *
 *   1. the watcher (`observe`) — a message that looks like a course
 *      announcement becomes a `pending` draft; the ZIPs posted after it in the
 *      same forum topic are attached to that draft;
 *   2. an admin (`approve` / `discard`) — approving writes the Course and its
 *      `TelegramCourseLink` rows; discarding keeps the row as an audit trail so
 *      the same post is never proposed twice.
 *
 * The important constraint is that this is *rule-based*. It cannot read video,
 * understand a bad translation, or invent a lecturer. It recognises the format
 * the group actually uses and asks a human when the format is unrecognised.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DraftFile,
  DraftPayload,
  announcementSignals,
  categorize,
  cleanFileName,
  confidenceFrom,
  draftSlug,
  moduleFromFile,
  nextPartIndex,
  parseAnnouncement,
} from './draft-parser';

/** A document or video posted in a forum topic. */
export interface DraftIncomingFile {
  messageId: number;
  fileId: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface DraftIncoming {
  messageId: number;
  chat: { id: number; type: string; username?: string | null; title?: string | null };
  threadId: number | null;
  from: { id: number; username?: string | null; firstName?: string | null; isBot?: boolean } | null;
  text: string | null;
  date: Date;
  file: DraftIncomingFile | null;
}

export type ObserveResult =
  | { action: 'ignored'; reason: string }
  | { action: 'announcement'; draftId: string; payload: DraftPayload; created: boolean }
  | { action: 'file'; draftId: string; fileName: string; payload: DraftPayload };

/** A file is only considered part of a draft for this long after the post. */
const COLLECT_WINDOW_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class IngestDraftService {
  private readonly logger = new Logger('IngestDraft');

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Watcher
  // ---------------------------------------------------------------

  /**
   * Main entry point, called for every group message. Returns what happened so
   * the caller can post a review card, without this service knowing anything
   * about Telegram's message format.
   */
  async observe(input: DraftIncoming): Promise<ObserveResult> {
    if (!this.watcherEnabled()) return { action: 'ignored', reason: 'watcher disabled' };
    if (!this.isGroup(input.chat.type)) return { action: 'ignored', reason: 'not a group' };
    if (input.from?.isBot) return { action: 'ignored', reason: 'bot message' };
    if (!this.chatAllowed(input.chat)) return { action: 'ignored', reason: 'chat not in allowlist' };

    if (input.file) return this.observeFile(input);
    if (input.text) return this.observeAnnouncement(input);
    return { action: 'ignored', reason: 'nothing to read' };
  }

  private watcherEnabled(): boolean {
    return (process.env.TELEGRAM_WATCHER_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  private isGroup(type: string): boolean {
    return type === 'group' || type === 'supergroup';
  }

  /**
   * `TELEGRAM_SOURCE_CHATS` is a comma list of usernames or numeric ids. Empty
   * means "any group the bot is in", which is the right default for a private
   * group where the bot has no other purpose.
   */
  private chatAllowed(chat: DraftIncoming['chat']): boolean {
    const raw = (process.env.TELEGRAM_SOURCE_CHATS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    if (raw.length === 0) return true;
    const id = String(chat.id);
    const username = (chat.username ?? '').toLowerCase();
    return raw.includes(id) || (username !== '' && raw.includes(username));
  }

  /** Category override for a dedicated forum topic: `12:programming,34:design`. */
  private topicOverride(threadId: number | null): string | null {
    if (threadId === null) return null;
    const raw = (process.env.TELEGRAM_TOPIC_CATEGORIES ?? '').split(',');
    for (const pair of raw) {
      const [id, slug] = pair.split(':').map((s) => s.trim());
      if (id && slug && Number(id) === threadId) return slug;
    }
    return null;
  }

  /**
   * An announcement opens the draft. Re-sending the same message id (Telegram
   * redelivers updates after a failed webhook) must not create a second one.
   */
  private async observeAnnouncement(input: DraftIncoming): Promise<ObserveResult> {
    const text = (input.text ?? '').trim();
    const links = Array.from(text.matchAll(/https?:\/\/t\.me\/[^\s]+/g), (m) => m[0].replace(/[),.;]+$/, ''));
    const parsed = parseAnnouncement({
      text,
      postedAt: input.date,
      links,
    });
    if (!parsed) return { action: 'ignored', reason: 'not a course announcement' };
    if (parsed.title.replace(/[^a-z0-9]/gi, '').length < 4) {
      return { action: 'ignored', reason: 'title too short to be a course' };
    }

    const existing = await this.prisma.ingestDraft.findFirst({
      where: { chatId: BigInt(input.chat.id), messageIds: { has: BigInt(input.messageId) } },
      select: { id: true, payload: true, status: true },
    });
    if (existing) {
      return {
        action: 'announcement',
        draftId: existing.id,
        payload: existing.payload as unknown as DraftPayload,
        created: false,
      };
    }

    const signals = announcementSignals(text, parsed);
    const payload: DraftPayload = {
      version: 1,
      announcement: {
        title: parsed.title,
        slug: parsed.slug,
        description: parsed.description,
        lecturerNames: parsed.taughtBy,
        durationMin: parsed.durationMin,
        lessonCount: parsed.lessonCount,
        ratingAvg: parsed.ratingAvg,
        ratingCount: parsed.ratingCount,
        originalPrice: parsed.originalPrice,
        hashtags: parsed.hashtags,
        sourceUrl: parsed.sourceUrl ?? this.messageLink(input.chat.username ?? null, input.messageId),
        postedAt: input.date.toISOString(),
      },
      chat: {
        id: input.chat.id,
        username: input.chat.username ?? null,
        title: input.chat.title ?? null,
      },
      topic: { id: input.threadId, name: null },
      author: {
        id: input.from?.id ?? null,
        username: input.from?.username ?? null,
        firstName: input.from?.firstName ?? null,
      },
      files: [],
      categorySlugs: categorize({
        title: parsed.title,
        description: parsed.description,
        hashtags: parsed.hashtags,
        fileNames: [],
        topicOverride: this.topicOverride(input.threadId),
      }),
      confidence: confidenceFrom(signals, parsed),
      signals,
      cardMessageId: null,
    };

    // A course that already exists is still worth reviewing — the post may add
    // files — but the card must say so instead of pretending it is new.
    const duplicate = await this.prisma.course.findUnique({
      where: { slug: draftSlug(parsed.title) },
      select: { id: true, deletedAt: true },
    });
    if (duplicate && !duplicate.deletedAt) payload.signals.push('course-exists');

    // If a draft for this topic is still open, this announcement supersedes it
    // for file collection. Both stay reviewable; the newest wins.
    const draft = await this.prisma.ingestDraft.create({
      data: {
        chatId: BigInt(input.chat.id),
        chatUsername: input.chat.username ?? null,
        topicId: input.threadId === null ? null : BigInt(input.threadId),
        topicName: null,
        messageIds: [BigInt(input.messageId)],
        payload: payload as unknown as Prisma.InputJsonValue,
        status: 'pending',
      },
    });

    this.logger.log(
      `draft ${draft.id} created: "${parsed.title}" (${payload.confidence * 100}% · ${signals.join(', ')})`,
    );
    return { action: 'announcement', draftId: draft.id, payload, created: true };
  }

  /**
   * Files posted after the announcement join its draft. Nothing is downloaded:
   * the bot only needs the `file_id` Telegram already gave us, and delivery
   * later reuses it.
   */
  private async observeFile(input: DraftIncoming): Promise<ObserveResult> {
    const file = input.file!;
    const open = await this.prisma.ingestDraft.findFirst({
      where: {
        chatId: BigInt(input.chat.id),
        topicId: input.threadId === null ? null : BigInt(input.threadId),
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - COLLECT_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!open) return { action: 'ignored', reason: 'no open draft in this topic' };

    const payload = open.payload as unknown as DraftPayload;
    if (payload.files.some((f) => f.messageId === input.messageId)) {
      return { action: 'ignored', reason: 'file message already attached' };
    }

    const fileName = cleanFileName(file.fileName);
    const fileSizeMb = file.fileSize === null ? null : Number((file.fileSize / 1024 / 1024).toFixed(1));

    // The same archive re-posted is not a second part.
    if (payload.files.some((f) => f.fileName === fileName && f.fileSizeMb === fileSizeMb)) {
      return { action: 'ignored', reason: 'duplicate file name and size' };
    }

    const { moduleTitle, partIndex: claimed } = moduleFromFile(fileName, payload.files.length);
    const next: DraftFile = {
      messageId: input.messageId,
      fileId: file.fileId,
      fileName,
      fileSizeMb,
      mimeType: file.mimeType,
      moduleTitle,
      partIndex: nextPartIndex(payload.files, moduleTitle, claimed),
      addedAt: new Date().toISOString(),
    };
    payload.files.push(next);

    await this.prisma.ingestDraft.update({
      where: { id: open.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        messageIds: { push: BigInt(input.messageId) },
      },
    });

    return { action: 'file', draftId: open.id, fileName, payload };
  }

  /**
   * Remember the bot's review card so later events (a new file, an approval)
   * can edit that bubble instead of posting another one.
   */
  async rememberCard(draftId: string, messageId: number): Promise<void> {
    const draft = await this.prisma.ingestDraft.findUnique({
      where: { id: draftId },
      select: { payload: true },
    });
    if (!draft) return;
    const payload = draft.payload as unknown as DraftPayload;
    payload.cardMessageId = messageId;
    await this.prisma.ingestDraft.update({
      where: { id: draftId },
      data: { payload: payload as unknown as Prisma.InputJsonValue },
    });
  }

  // ---------------------------------------------------------------
  // Review
  // ---------------------------------------------------------------

  async list(status = 'pending', limit = 20) {
    const rows = await this.prisma.ingestDraft.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((r) => this.serialize(r));
  }

  /** Accepts a full id or the first 8 characters shown in the chat card. */
  async find(idOrPrefix: string) {
    const trimmed = idOrPrefix.trim();
    if (!trimmed) throw new BadRequestException('Draft id is required');
    const exact = await this.prisma.ingestDraft.findUnique({ where: { id: trimmed } });
    if (exact) return exact;
    if (trimmed.length < 4) throw new NotFoundException('Draft not found');
    const matches = await this.prisma.ingestDraft.findMany({
      where: { id: { startsWith: trimmed } },
      take: 2,
      orderBy: { createdAt: 'desc' },
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new BadRequestException(`"${trimmed}" matches more than one draft`);
    throw new NotFoundException('Draft not found');
  }

  async get(idOrPrefix: string) {
    return this.serialize(await this.find(idOrPrefix));
  }

  /**
   * Write the course. Safe to call twice: the second call returns the course
   * the first one created instead of duplicating anything.
   */
  async approve(idOrPrefix: string, actor?: { telegramId?: number | null; userId?: string | null }) {
    const draft = await this.find(idOrPrefix);
    if (draft.status === 'discarded') throw new BadRequestException('That draft was discarded');
    if (draft.status === 'failed') throw new BadRequestException('That draft failed; re-post it instead');

    if (draft.status === 'approved' && draft.approvedCourseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: draft.approvedCourseId },
        select: { id: true, slug: true, title: true },
      });
      return { alreadyApproved: true as const, course, filesAdded: 0, modules: 0 };
    }

    const payload = draft.payload as unknown as DraftPayload;
    const title = payload?.announcement?.title?.trim();
    if (!title) throw new BadRequestException('Draft has no title');

    const slug = await this.uniqueSlug(draftSlug(title), title);
    const lecturer = await this.resolveLecturer(payload.announcement.lecturerNames);
    const categories = await this.prisma.category.findMany({
      where: { slug: { in: payload.categorySlugs ?? [] } },
      select: { id: true, slug: true },
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let course = await tx.course.findUnique({ where: { slug } });
        const created = !course;

        if (!course) {
          course = await tx.course.create({
            data: {
              title,
              slug,
              description:
                payload.announcement.description.trim() ||
                `${title} — added from the ${payload.chat.username ? '@' + payload.chat.username : 'Telegram'} group.`,
              lecturerId: lecturer?.id ?? null,
              originalPrice: payload.announcement.originalPrice ?? null,
              price: payload.announcement.originalPrice ?? null,
              ratingAvg: payload.announcement.ratingAvg ?? 0,
              ratingCount: payload.announcement.ratingCount ?? 0,
              sourceUrl: payload.announcement.sourceUrl ?? null,
              publishedAt: payload.announcement.postedAt ? new Date(payload.announcement.postedAt) : new Date(),
              isPremium: false,
              isFeatured: false,
              contentType: 'course',
            },
          });
        } else {
          // A re-post can fill a gap, but must never rewrite an edited course.
          course = await tx.course.update({
            where: { id: course.id },
            data: {
              sourceUrl: course.sourceUrl ?? payload.announcement.sourceUrl ?? null,
              originalPrice: course.originalPrice ?? payload.announcement.originalPrice ?? null,
              deletedAt: null,
            },
          });
        }

        if (lecturer) {
          await tx.courseLecturer.upsert({
            where: { courseId_lecturerId: { courseId: course.id, lecturerId: lecturer.id } },
            create: { courseId: course.id, lecturerId: lecturer.id, orderIndex: 0 },
            update: {},
          });
          if (!course.lecturerId) {
            await tx.course.update({ where: { id: course.id }, data: { lecturerId: lecturer.id } });
          }
        }

        // A failed insert inside a transaction aborts the whole transaction on
        // Postgres, so check first instead of catching a unique violation.
        const linkedCategories = await tx.courseCategory.findMany({
          where: { courseId: course.id },
          select: { categoryId: true },
        });
        const linkedCategoryIds = new Set(linkedCategories.map((c) => c.categoryId));
        for (const cat of categories) {
          if (linkedCategoryIds.has(cat.id)) continue;
          await tx.courseCategory.create({ data: { courseId: course.id, categoryId: cat.id } });
        }

        const tags = [...new Set((payload.announcement.hashtags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
        for (const tag of tags) {
          const linked = await tx.courseTag.findFirst({ where: { courseId: course.id, tag } });
          if (!linked) await tx.courseTag.create({ data: { courseId: course.id, tag } });
        }

        const files = payload.files ?? [];
        const existing = await tx.telegramCourseLink.findMany({
          where: { courseId: course.id },
          select: { fileMessageId: true, fileName: true, fileSizeMb: true, moduleTitle: true, moduleOrder: true, partIndex: true },
        });
        const seenMessages = new Set(existing.map((f) => String(f.fileMessageId)));
        const seenNames = new Set(existing.map((f) => `${f.fileName ?? ''}\u0000${f.fileSizeMb ?? ''}`));
        const moduleOrder = new Map<string | null, number>();
        const partCursor = new Map<string | null, number>();
        for (const f of existing) {
          const key = f.moduleTitle ?? null;
          moduleOrder.set(key, Math.max(moduleOrder.get(key) ?? 0, f.moduleOrder));
          partCursor.set(key, Math.max(partCursor.get(key) ?? 0, f.partIndex));
        }
        let nextModuleOrder = Math.max(0, ...[...moduleOrder.values()].map((n) => n + 1));

        const rows: Prisma.TelegramCourseLinkCreateManyInput[] = [];
        for (const file of files) {
          if (seenMessages.has(String(file.messageId))) continue;
          if (seenNames.has(`${file.fileName}\u0000${file.fileSizeMb ?? ''}`)) continue;
          seenMessages.add(String(file.messageId));
          seenNames.add(`${file.fileName}\u0000${file.fileSizeMb ?? ''}`);

          const key = file.moduleTitle ?? null;
          if (!moduleOrder.has(key)) moduleOrder.set(key, nextModuleOrder++);
          const partIndex = (partCursor.get(key) ?? 0) + 1;
          partCursor.set(key, partIndex);

          rows.push({
            courseId: course.id,
            moduleTitle: file.moduleTitle,
            moduleOrder: moduleOrder.get(key) ?? 0,
            partIndex,
            chatId: BigInt(payload.chat.id),
            chatUsername: payload.chat.username,
            messageThreadId: payload.topic.id === null ? null : BigInt(payload.topic.id),
            fileMessageId: BigInt(file.messageId),
            fileId: file.fileId,
            fileName: file.fileName,
            fileSizeMb: file.fileSizeMb,
            caption: null,
            createdById: actor?.userId ?? null,
          });
        }

        if (rows.length > 0) await tx.telegramCourseLink.createMany({ data: rows });

        payload.approvedCourseSlug = course.slug;
        await tx.ingestDraft.update({
          where: { id: draft.id },
          data: {
            status: 'approved',
            approvedCourseId: course.id,
            error: null,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          alreadyApproved: false as const,
          course: { id: course.id, slug: course.slug, title: course.title },
          filesAdded: rows.length,
          modules: new Set(rows.map((r) => r.moduleTitle ?? '')).size,
          created,
          categories: categories.map((c) => c.slug),
        };
      }, { timeout: 30_000 });

      this.logger.log(
        `draft ${draft.id} approved → ${result.course.slug} (${result.filesAdded} files, ${result.modules} modules)`,
      );
      return result;
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      await this.prisma.ingestDraft.update({
        where: { id: draft.id },
        data: { status: 'failed', error: message },
      });
      this.logger.error(`draft ${draft.id} approve failed: ${message}`);
      throw err;
    }
  }

  /** Keep the row: a discarded post must never be proposed a second time. */
  async discard(idOrPrefix: string) {
    const draft = await this.find(idOrPrefix);
    if (draft.status === 'approved') throw new BadRequestException('That draft is already a course');
    await this.prisma.ingestDraft.update({
      where: { id: draft.id },
      data: { status: 'discarded' },
    });
    return { id: draft.id, status: 'discarded' };
  }

  /** Counts for the admin console and `/drafts`. */
  async stats() {
    const [pending, approved, discarded, failed] = await Promise.all([
      this.prisma.ingestDraft.count({ where: { status: 'pending' } }),
      this.prisma.ingestDraft.count({ where: { status: 'approved' } }),
      this.prisma.ingestDraft.count({ where: { status: 'discarded' } }),
      this.prisma.ingestDraft.count({ where: { status: 'failed' } }),
    ]);
    return { pending, approved, discarded, failed };
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private async resolveLecturer(names: string[]): Promise<{ id: string } | null> {
    const name = names.find((n) => n.trim().length >= 2);
    if (!name) return null;
    const slug = draftSlug(name);
    const existing = await this.prisma.lecturer.findUnique({ where: { slug }, select: { id: true } });
    if (existing) return existing;
    return this.prisma.lecturer.create({
      data: { name: name.trim(), slug, socialLinks: '{}' },
      select: { id: true },
    });
  }

  /**
   * Re-posting a course must converge on the same row, so an existing course
   * with the same title keeps its slug. A different course that happens to
   * slugify identically gets a numeric suffix.
   */
  private async uniqueSlug(base: string, title: string): Promise<string> {
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.prisma.course.findUnique({
        where: { slug },
        select: { title: true },
      });
      if (!existing || existing.title === title) return slug;
      slug = `${base}-${n++}`;
    }
  }

  private messageLink(username: string | null, messageId: number): string | null {
    if (!username) return null;
    return `https://t.me/${username}/${messageId}`;
  }

  private serialize(draft: {
    id: string;
    chatId: bigint;
    chatUsername: string | null;
    topicId: bigint | null;
    topicName: string | null;
    messageIds: bigint[];
    payload: Prisma.JsonValue;
    status: string;
    error: string | null;
    approvedCourseId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: draft.id,
      shortId: draft.id.slice(0, 8),
      chatId: draft.chatId.toString(),
      chatUsername: draft.chatUsername,
      topicId: draft.topicId === null ? null : draft.topicId.toString(),
      topicName: draft.topicName,
      messageIds: draft.messageIds.map((m) => m.toString()),
      payload: draft.payload,
      status: draft.status,
      error: draft.error,
      approvedCourseId: draft.approvedCourseId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }
}
