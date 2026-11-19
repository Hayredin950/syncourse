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
  DraftFields,
  DraftImage,
  DraftImageRole,
  DraftPayload,
  announcementSignals,
  categorize,
  cleanFileName,
  confidenceFrom,
  draftSlug,
  moduleFromFile,
  nextPartIndex,
  normalizeCourseTitle,
  parseAnnouncement,
} from './draft-parser';
import {
  autoPublishBlockers,
  bodyFromPost,
  classifyStandalone,
  cleanPostTitle,
  courseKindFrom,
  describeAnnouncement,
  externalLink,
  extractFields,
  hasMeaningfulProse,
  mediaName,
  mediaRole,
  parseResourcePost,
  resourceTypeOf,
  stripPromo,
  titleFromPost,
  type DraftFieldKey,
  type StandaloneResource,
} from './draft-fields';
import { slugify } from './telegram-feed.parser';
import { TelegramMediaResolver } from './media-resolver.service';

/** A document or video posted in a forum topic. */
export interface DraftIncomingFile {
  messageId: number;
  fileId: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
}

/** A photo posted with the course (cover, lecturer, logo). */
export interface DraftIncomingImage {
  messageId: number;
  fileId: string;
  caption: string | null;
}

const WATCHER_CARD =
  /\b(?:course|resource)\s+published\b|\bnew\s+(?:course|resource)\s+draft\b|approve[\s\S]{0,120}discard/i;

/**
 * True for the bot's own review and receipt cards. Those cards repeat a course
 * title and metadata, so handing them back to the parser would create a draft
 * of the draft. Ordinary bot posts (a channel or scheduler publishing a real
 * course) are allowed through.
 */
function isWatcherCard(text: string | null): boolean {
  return WATCHER_CARD.test(text ?? '');
}

export interface DraftIncoming {
  messageId: number;
  chat: { id: number; type: string; username?: string | null; title?: string | null };
  threadId: number | null;
  from: { id: number; username?: string | null; firstName?: string | null; isBot?: boolean } | null;
  text: string | null;
  date: Date;
  file: DraftIncomingFile | null;
  image?: DraftIncomingImage | null;
  /** Telegram album id. Members of one album arrive as separate updates. */
  mediaGroupId?: string | null;
}

export type ObserveResult =
  | { action: 'ignored'; reason: string }
  | { action: 'announcement'; draftId: string; payload: DraftPayload; created: boolean }
  | { action: 'file'; draftId: string; fileName: string; payload: DraftPayload }
  | { action: 'image'; draftId: string; role: DraftImageRole; payload: DraftPayload }
  | { action: 'published'; draftId: string; payload: DraftPayload; courseSlug: string | null };

/** A file is only considered part of a draft for this long after the post. */
const COLLECT_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * What approval produced. Exactly one of `course` / `resource` is set, and
 * both are optional in the type because callers (bot, admin console, tests)
 * only care about the one they asked for.
 */
export interface ApproveResult {
  alreadyApproved: boolean;
  course?: { id: string; slug: string; title: string };
  resource?: { id: string; slug: string; title: string };
  filesAdded: number;
  modules: number;
  mediaAdded?: number;
  created?: boolean;
  categories?: string[];
}

@Injectable()
export class IngestDraftService {
  private readonly logger = new Logger('IngestDraft');

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: TelegramMediaResolver,
  ) {}

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
    // A bot normally echoes commands and review cards; those must not become
    // drafts. A real course can also be posted by a bot or an anonymous admin,
    // so only the watcher's own cards are rejected, not every bot message.
    if (input.from?.isBot && isWatcherCard(input.text)) {
      return { action: 'ignored', reason: 'watcher card' };
    }
    if (!this.chatAllowed(input.chat)) return { action: 'ignored', reason: 'chat not in allowlist' };

    const text = (input.text ?? '').trim();

    // A document, video or audio file. A long caption makes the message its
    // own post (a video explainer, an audiobook, a book), while a short or
    // missing caption means it belongs to the post above it.
    if (input.file) {
      const archive = isArchiveFile(input.file);
      const ownPost = text.length >= 80 || text.includes('\n');

      // A video or document inside a photo album belongs to that album, even
      // if Telegram delivered it before the captioned first frame.
      if (input.mediaGroupId) {
        const group = await this.findDraftByMediaGroup(input.chat.id, input.threadId, input.mediaGroupId);
        if (group) {
          const attached = await this.observeFile(input);
          if (attached.action !== 'ignored') return attached;
        }
      }

      if (!archive && ownPost) {
        const standalone = await this.observeStandalone(input);
        if (standalone.action !== 'ignored') return standalone;
      }
      const attached = await this.observeFile(input);
      if (attached.action !== 'ignored' || archive) return attached;
      // A re-post of a file already attached to the open draft is a duplicate,
      // not a new post; only a file with nowhere to go becomes its own post.
      if (attached.reason === 'file message already attached or duplicated') return attached;
      return this.observeStandalone(input);
    }

    // Text first: a photo can carry the whole announcement as its caption.
    // When it is not a course template, it is still a normal post.
    if (text) {
      const result = await this.observeAnnouncement(input);
      if (result.action !== 'ignored') return result;
      if (input.image) {
        // `cover`, `lecturer`, `org: Udemy` name a role in the open draft;
        // every other caption is the title of a new resource post.
        if (mediaRole(input.image.caption, [])) return this.observeImage(input);
        return this.observeStandalone(input);
      }
      return this.observeStandalone(input);
    }

    // A photo with no caption: an album frame, or a photo-only post.
    if (input.image) return this.observeStandalone(input);

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
    // Explicit lines (`org: Udemy`, `level: Advanced`) are removed before the
    // announcement parser runs, so they cannot leak into the description.
    const extracted = extractFields(text);
    const values = extracted.values;
    // Distribution lines (`📤 Download …`, `🔗 Join …`) are not part of the
    // post: leaving them in used to make one of them the title and another the
    // description.
    const cleaned = stripPromo(extracted.cleaned);
    const resourceType = resourceTypeOf(values, text);

    const links = Array.from(cleaned.matchAll(/https?:\/\/t\.me\/[^\s]+/g), (m) => m[0].replace(/[),.;]+$/, ''));
    const parsed = parseAnnouncement({
      text: cleaned,
      postedAt: input.date,
      links,
    });
    // `resource: Figma shortcuts` names the post, so the body is whatever
    // prose is left after the field lines are removed.
    const resourceMarker = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^resource\s*:/i.test(l));
    const resource = resourceType
      ? parseResourcePost(cleaned, values, resourceMarker?.replace(/^resource\s*:\s*/i, ''))
      : null;
    if (!parsed && !resource) return { action: 'ignored', reason: 'not a course announcement' };

    const title = cleanPostTitle(values.title ?? resource?.title ?? parsed?.title ?? '');
    if (title.replace(/[^a-z0-9]/gi, '').length < 4) {
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

    const fields: DraftFields = {};
    if (values.title) fields.title = title;
    if (values.description) fields.description = values.description;
    if (values.lecturerNames) fields.lecturerNames = splitNames(values.lecturerNames);
    if (values.lecturerBio) fields.lecturerBio = values.lecturerBio;
    if (values.organizationName) fields.organizationName = values.organizationName;
    if (values.organizationType) fields.organizationType = values.organizationType.toLowerCase();
    if (values.organizationDescription) fields.organizationDescription = values.organizationDescription;
    if (values.categorySlugs) fields.categorySlugs = splitList(values.categorySlugs).map(slugify).filter(Boolean);
    if (values.levelName) fields.levelName = values.levelName;
    if (values.contentType) fields.contentType = values.contentType.toLowerCase();
    if (values.tags) fields.tags = splitList(values.tags);
    if (values.language) fields.language = values.language;
    if (values.resourceSummary) fields.resourceSummary = values.resourceSummary;
    if (values.sourceUrl) fields.sourceUrl = values.sourceUrl;
    if (values.coverUrl && /^https?:\/\//i.test(values.coverUrl)) fields.coverUrl = values.coverUrl;
    if (values.isPremium !== undefined) fields.isPremium = /^(true|yes|1|premium)$/i.test(values.isPremium);

    const price = parseMoney(values.price);
    if (price !== undefined) fields.price = price;
    const originalPrice = parseMoney(values.originalPrice);
    if (originalPrice !== undefined) fields.originalPrice = originalPrice;

    // A short course announced with a duration but no lesson count is a
    // mini-course. `type: course` / `type: mini-course` still wins.
    if (!resourceType) {
      fields.contentType = courseKindFrom({
        text: cleaned,
        title,
        durationMin: parsed?.durationMin ?? null,
        lessonCount: parsed?.lessonCount ?? null,
        declared: values.contentType ?? null,
      });
    }

    const lecturerNames = fields.lecturerNames ?? parsed?.taughtBy ?? [];
    const described = (fields.description ?? resource?.body ?? describeAnnouncement(cleaned, parsed?.title ?? title)).trim();
    const description = (described || parsed?.description || '').trim();
    // Hashtags live on a line of their own, which the promo stripper removes as
    // metadata, so they are read from the original post.
    const rawHashtags = Array.from(text.matchAll(/#([\p{L}\p{N}_-]+)/gu), (m) => m[1]);
    const tags = fields.tags ?? (parsed?.hashtags?.length ? parsed.hashtags : rawHashtags);
    const original = originalPrice ?? price ?? parsed?.originalPrice ?? null;

    const signals = resourceType
      ? ['explicit-resource', ...(description.length >= 60 ? ['description'] : [])]
      : announcementSignals(cleaned, parsed!);
    if (!resourceType) {
      // The promo stub carried the "Download Full Course" line and the promo
      // stripper removes it again, so the signal has to be read from the raw
      // post. The description is often the only prose, and it counts too.
      if (description.length >= 60 && !signals.includes('description')) signals.push('description');
      if (/download (?:full |the )?courses?/i.test(text) && !signals.includes('download-line')) {
        signals.push('download-line');
      }
      if (values.contentType) signals.push('type-explicit');
    }

    // A course's source is the group post itself; the `📤 Download` links are
    // someone else's channel. A resource keeps its real external source.
    const sourceUrl =
      fields.sourceUrl ??
      (resourceType ? externalLink(text) : null) ??
      this.messageLink(input.chat.username ?? null, input.messageId);

    const payload: DraftPayload = {
      version: 1,
      kind: resourceType ? 'resource' : 'course',
      announcement: {
        title,
        slug: draftSlug(title),
        description,
        lecturerNames,
        durationMin: parsed?.durationMin ?? null,
        lessonCount: parsed?.lessonCount ?? null,
        ratingAvg: parsed?.ratingAvg ?? null,
        ratingCount: parsed?.ratingCount ?? null,
        // `price: 0` is an explicit "free", which is not the same as unstated.
        originalPrice: original,
        hashtags: tags,
        sourceUrl,
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
      images: [],
      fields: {
        ...fields,
        ...(resourceType ? { resourceType } : {}),
      },
      categorySlugs:
        fields.categorySlugs && fields.categorySlugs.length > 0
          ? fields.categorySlugs
          : categorize({
              title,
              description,
              hashtags: tags,
              fileNames: [],
              topicOverride: this.topicOverride(input.threadId),
            }),
      confidence: resourceType ? 0.95 : confidenceFrom(signals, parsed!),
      signals,
      cardMessageId: null,
    };

    // The photo that carries the announcement is the cover. Reading role words
    // first tagged it `lecturer` whenever the body said "Taught By", which is
    // how a course ended up with a lecturer photo and no cover.
    if (input.image) this.attachImage(payload, input.image, 'cover', input.mediaGroupId ?? null);

    // A course that already exists is still worth reviewing — the post may add
    // files — but the card must say so instead of pretending it is new.
    if (!resourceType) {
      const duplicate = await this.prisma.course.findUnique({
        where: { slug: draftSlug(title) },
        select: { id: true, deletedAt: true },
      });
      if (duplicate && !duplicate.deletedAt) payload.signals.push('course-exists');
    }

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
      `draft ${draft.id} created: "${title}" (${payload.confidence * 100}% · ${payload.signals.join(', ')})`,
    );

    const published = await this.maybeAutoPublish(draft.id, payload);
    if (published) return published;

    return { action: 'announcement', draftId: draft.id, payload, created: true };
  }

  /**
   * Attach a photo to a draft under a role. The caller can force `cover` when
   * the caption is the post itself; otherwise the caption decides. Gallery
   * frames append rather than replacing each other.
   */
  private attachImage(
    payload: DraftPayload,
    image: DraftIncomingImage,
    roleOverride?: DraftImageRole,
    mediaGroupId?: string | null,
  ): DraftImageRole | null {
    const images = (payload.images ??= []);
    if (images.some((i) => i.messageId === image.messageId)) return null;
    const role = roleOverride ?? mediaRole(image.caption, images);
    if (!role) return null;

    const name = mediaName(image.caption);
    const next: DraftImage = {
      role,
      fileId: image.fileId,
      messageId: image.messageId,
      caption: image.caption ?? null,
      name,
      mediaGroupId: mediaGroupId ?? null,
    };
    // Re-posting a role replaces it instead of stacking two covers. Gallery
    // frames always append: an album is many pictures, not one.
    if (role === 'gallery') {
      images.push(next);
    } else {
      const at = images.findIndex((i) => i.role === role);
      if (at >= 0) images[at] = next;
      else images.push(next);
    }

    if (role === 'organization' && name) {
      payload.fields = { ...(payload.fields ?? {}), organizationName: payload.fields?.organizationName ?? name };
    }
    if (role === 'lecturer' && name && (payload.announcement.lecturerNames ?? []).length === 0) {
      payload.announcement.lecturerNames = [name];
    }
    return role;
  }

  /** Called after every write: publish when nothing a reader needs is missing. */
  private async maybeAutoPublish(draftId: string, payload: DraftPayload): Promise<ObserveResult | null> {
    if (!this.autoPublishEnabled()) return null;
    if (autoPublishBlockers(payload).length > 0) return null;

    payload.autoPublished = true;
    await this.prisma.ingestDraft.update({
      where: { id: draftId },
      data: { payload: payload as unknown as Prisma.InputJsonValue },
    });
    try {
      const result = await this.approve(draftId);
      const slug = 'course' in result ? result.course?.slug ?? null : result.resource?.slug ?? null;
      this.logger.log(`draft ${draftId} auto-published → ${slug ?? 'unknown'}`);
      return { action: 'published', draftId, payload, courseSlug: slug };
    } catch (err) {
      // Auto-publish is an optimisation; a failure must leave the draft in the
      // queue, not mark it failed.
      this.logger.warn(`auto-publish ${draftId} failed: ${(err as Error).message}`);
      await this.prisma.ingestDraft.update({
        where: { id: draftId },
        data: { status: 'pending', error: (err as Error).message.slice(0, 500) },
      });
      payload.autoPublished = false;
      return null;
    }
  }

  private autoPublishEnabled(): boolean {
    return (process.env.TELEGRAM_AUTOPUBLISH ?? 'true').toLowerCase() !== 'false';
  }

  /**
   * Files posted after the announcement join its draft. Nothing is downloaded:
   * the bot only needs the `file_id` Telegram already gave us, and delivery
   * later reuses it.
   */
  private async observeFile(input: DraftIncoming): Promise<ObserveResult> {
    const file = input.file!;
    // A video/audio frame of an album belongs to that album, never to whatever
    // unrelated draft happens to be open. Archives are the exception: a course
    // posted as a ZIP album still belongs to the course draft above it.
    const open =
      input.mediaGroupId && !isArchiveFile(file)
        ? await this.findDraftByMediaGroup(input.chat.id, input.threadId, input.mediaGroupId)
        : await this.findOpenDraft(input.chat.id, input.threadId, input.mediaGroupId ?? null);
    if (!open) return { action: 'ignored', reason: 'no open draft in this topic' };

    const payload = open.payload as unknown as DraftPayload;
    const entry = this.draftFileEntry(input, payload);
    if (!entry) return { action: 'ignored', reason: 'file message already attached or duplicated' };
    payload.files.push(entry);

    // A title + picture post that starts receiving module ZIPs is a course,
    // even if it never used the announcement template. A resource with real
    // prose, an explicit `resource:` marker, or a manual approval stays one.
    if (this.shouldUpgradeToCourse(open, payload, file)) {
      await this.upgradeToCourse(open, payload);
    }

    // One to three archives is a mini-course; a long curriculum is a course.
    // An explicit `type:` line always wins.
    if ((payload.kind ?? 'course') === 'course' && !payload.signals.includes('type-explicit')) {
      payload.fields = { ...(payload.fields ?? {}) };
      payload.fields.contentType = courseKindFrom({
        text: payload.announcement.title,
        title: payload.announcement.title,
        durationMin: payload.announcement.durationMin,
        lessonCount: payload.announcement.lessonCount,
        fileCount: payload.files.length,
      });
    }

    await this.prisma.ingestDraft.update({
      where: { id: open.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        messageIds: { push: BigInt(input.messageId) },
      },
    });

    const published = await this.maybeAutoPublish(open.id, payload);
    if (published) return published;

    return { action: 'file', draftId: open.id, fileName: entry.fileName, payload };
  }

  /** Build the draft entry for a file, or null when it is already attached. */
  private draftFileEntry(input: DraftIncoming, payload: DraftPayload): DraftFile | null {
    const file = input.file!;
    if (payload.files.some((f) => f.messageId === input.messageId)) return null;

    const fileName = cleanFileName(file.fileName);
    const fileSizeMb = file.fileSize === null ? null : Number((file.fileSize / 1024 / 1024).toFixed(1));

    // The same archive re-posted is not a second part.
    if (payload.files.some((f) => f.fileName === fileName && f.fileSizeMb === fileSizeMb)) {
      return null;
    }

    const { moduleTitle, partIndex: claimed } = moduleFromFile(fileName, payload.files.length);
    return {
      messageId: input.messageId,
      fileId: file.fileId,
      fileName,
      fileSizeMb,
      mimeType: file.mimeType,
      moduleTitle,
      partIndex: nextPartIndex(payload.files, moduleTitle, claimed),
      addedAt: new Date().toISOString(),
      mediaGroupId: input.mediaGroupId ?? null,
    };
  }

  private shouldUpgradeToCourse(
    row: { status: string },
    payload: DraftPayload,
    file: NonNullable<DraftIncoming['file']>,
  ): boolean {
    if ((payload.kind ?? 'course') !== 'resource') return false;
    if (!isArchiveFile(file)) return false;
    if (payload.signals.includes('explicit-resource')) return false;
    // Prose means a real resource with an archive attachment (a ZIP of
    // examples); an empty body plus module ZIPs means a course. Hashtags,
    // links and emoji are not prose — "Claude Code for Professional
    // Developers 🔥👇🏼 #claude_code_devs" is a course title, not a body.
    if (hasMeaningfulProse(payload.fields?.description ?? payload.announcement.description)) {
      return false;
    }
    // An already-approved resource can still be converted while it is fresh
    // and auto-published, but never after an operator approved it.
    if (row.status === 'approved' && !payload.autoPublished) return false;
    return true;
  }

  /**
   * Turn a fresh, auto-published picture resource into a course when its ZIPs
   * arrive a second later. The resource row is removed so the catalogue does
   * not keep a duplicate beside the course.
   */
  private async upgradeToCourse(
    row: { id: string; status: string; updatedAt: Date },
    payload: DraftPayload,
  ): Promise<void> {
    if (row.status === 'approved' && payload.approvedCourseSlug) {
      const age = Date.now() - row.updatedAt.getTime();
      if (age < 15 * 60 * 1000) {
        await this.prisma.resource.deleteMany({ where: { slug: payload.approvedCourseSlug } }).catch(() => undefined);
      } else {
        return;
      }
    }
    payload.kind = 'course';
    payload.approvedCourseSlug = undefined;
    payload.autoPublished = false;
    payload.signals = payload.signals.filter((s) => s !== 'resource' && !s.startsWith('resource:'));
    if (!payload.signals.includes('simple-course')) payload.signals.push('simple-course');
    payload.confidence = Math.max(payload.confidence, 0.8);
    payload.fields = { ...(payload.fields ?? {}) };
    delete payload.fields.resourceType;
    delete payload.fields.resourceSummary;
    payload.fields.contentType = courseKindFrom({
      text: payload.announcement.title,
      title: payload.announcement.title,
      durationMin: payload.announcement.durationMin,
      lessonCount: payload.announcement.lessonCount,
      fileCount: payload.files.length,
      declared: payload.fields.contentType ?? null,
    });
    if (row.status === 'approved') {
      await this.prisma.ingestDraft.update({
        where: { id: row.id },
        data: {
          status: 'pending',
          approvedCourseId: null,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /**
   * A role-captioned photo (`cover`, `lecturer`, `org: Udemy`) joins the open
   * draft. A normal post never comes here: it starts its own resource instead.
   */
  private async observeImage(input: DraftIncoming): Promise<ObserveResult> {
    const image = input.image;
    if (!image) return { action: 'ignored', reason: 'no image' };
    const open = await this.findOpenDraft(input.chat.id, input.threadId, input.mediaGroupId ?? null);
    if (!open) return { action: 'ignored', reason: 'no open draft in this topic' };

    const payload = open.payload as unknown as DraftPayload;
    const role = this.attachImage(payload, image, undefined, input.mediaGroupId ?? null);
    if (!role) return { action: 'ignored', reason: 'photo caption names no role' };

    await this.prisma.ingestDraft.update({
      where: { id: open.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        messageIds: { push: BigInt(input.messageId) },
      },
    });

    const published = await this.maybeAutoPublish(open.id, payload);
    if (published) return published;

    return { action: 'image', draftId: open.id, role, payload };
  }

  /**
   * A normal post that is not a course template: a picture, an album, a video,
   * a book, a note or a roadmap. It becomes a Resource draft with its image and
   * media attached, so the next ZIP/epub can still find a post to join.
   */
  private async observeStandalone(input: DraftIncoming): Promise<ObserveResult> {
    const cls = classifyStandalone({
      text: input.text,
      hasImage: Boolean(input.image),
      hasMediaFile: Boolean(input.file && !isArchiveFile(input.file)),
      hasArchive: Boolean(input.file && isArchiveFile(input.file)),
      fileName: input.file?.fileName ?? null,
      date: input.date,
    });
    if (!cls) return { action: 'ignored', reason: 'not a post' };

    // A later frame of the same album belongs to the draft the first frame
    // opened, even when Telegram delivers the frames out of order.
    if (input.mediaGroupId) {
      const group = await this.findDraftByMediaGroup(input.chat.id, input.threadId, input.mediaGroupId);
      if (group) return this.joinDraftWithPost(group, input, cls);
    }

    // An uncaptioned picture that arrives just after a text-only post or an
    // audio post is that post's cover, not a new post of its own.
    if (cls.needsTitle && input.image && !input.mediaGroupId) {
      const host = await this.findRecentCoverlessDraft(input.chat.id, input.threadId);
      if (host) {
        const attached = await this.attachToDraft(host, input);
        if (attached.action !== 'ignored') return attached;
      }
    }

    // Telegram redelivers updates; the same message must not open two posts.
    const existing = await this.prisma.ingestDraft.findFirst({
      where: { chatId: BigInt(input.chat.id), messageIds: { has: BigInt(input.messageId) } },
      select: { id: true },
    });
    if (existing) return { action: 'ignored', reason: 'post already drafted' };

    const title = cls.title;
    const body = cls.body;
    const hashtags = Array.from((input.text ?? '').matchAll(/#(\w[\w-]*)/g), (m) => m[1]);
    const fileName = input.file?.fileName ?? null;
    const fields: DraftFields = {
      resourceType: cls.resourceType,
      ...(body ? { description: body } : {}),
    };

    const payload: DraftPayload = {
      version: 1,
      kind: 'resource',
      announcement: {
        title,
        slug: draftSlug(title),
        description: body,
        lecturerNames: [],
        durationMin: null,
        lessonCount: null,
        ratingAvg: null,
        ratingCount: null,
        originalPrice: null,
        hashtags,
        sourceUrl: externalLink(input.text ?? '') ?? this.messageLink(input.chat.username ?? null, input.messageId),
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
      images: [],
      fields,
      categorySlugs: categorize({
        title,
        description: body,
        hashtags,
        fileNames: fileName ? [fileName] : [],
        topicOverride: this.topicOverride(input.threadId),
      }),
      confidence: cls.confidence,
      signals: [...cls.signals],
      cardMessageId: null,
    };

    if (input.image) this.attachImage(payload, input.image, 'cover', input.mediaGroupId ?? null);
    if (input.file) {
      const entry = this.draftFileEntry(input, payload);
      if (entry) payload.files.push(entry);
    }

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
      `resource ${draft.id} created: "${title}" (${payload.confidence * 100}% · ${payload.signals.join(', ')})`,
    );

    const published = await this.maybeAutoPublish(draft.id, payload);
    if (published) return published;

    return { action: 'announcement', draftId: draft.id, payload, created: true };
  }

  /**
   * Attach one more frame/file to a draft an album already opened. A caption
   * that arrives after an uncaptioned first frame replaces the placeholder
   * title instead of creating a second post.
   */
  private async joinDraftWithPost(
    row: { id: string; payload: Prisma.JsonValue },
    input: DraftIncoming,
    cls: StandaloneResource,
  ): Promise<ObserveResult> {
    const payload = row.payload as unknown as DraftPayload;
    let role: DraftImageRole | null = null;
    let fileName: string | null = null;

    if (input.image) {
      // Every frame of an album is kept. A frame with a role caption still
      // names that role; the rest are gallery pictures of the same post.
      const suggested = mediaRole(input.image.caption, payload.images ?? []);
      const override = input.mediaGroupId && (!suggested || suggested === 'gallery') ? 'gallery' : suggested ?? undefined;
      role = this.attachImage(payload, input.image, override, input.mediaGroupId ?? null);
    }
    if (input.file) {
      const entry = this.draftFileEntry(input, payload);
      if (entry) {
        payload.files.push(entry);
        fileName = entry.fileName;
      }
    }
    if (!role && !fileName) return { action: 'ignored', reason: 'album member already attached' };

    const currentTitle = (payload.announcement.title ?? '').trim();
    const placeholder =
      payload.signals.includes('needs-title') ||
      payload.signals.includes('title-from-filename') ||
      !currentTitle ||
      currentTitle.startsWith('Photo post ·');

    if (placeholder && cls.title && !cls.needsTitle) {
      payload.announcement.title = cls.title;
      payload.announcement.slug = draftSlug(cls.title);
      payload.fields = { ...(payload.fields ?? {}), title: cls.title };
      payload.signals = payload.signals.filter(
        (s) => s !== 'needs-title' && s !== 'photo-only' && s !== 'title-from-filename',
      );
      payload.confidence = Math.max(payload.confidence, cls.confidence);
    }

    if (!(payload.fields?.description ?? payload.announcement.description ?? '').trim() && cls.body) {
      payload.announcement.description = cls.body;
      payload.fields = { ...(payload.fields ?? {}), description: cls.body };
    }
    if (!payload.fields?.resourceType && cls.resourceType) {
      payload.fields = { ...(payload.fields ?? {}), resourceType: cls.resourceType };
    }
    for (const signal of cls.signals) {
      if (signal === 'standalone' || signal === 'needs-title') continue;
      if (!payload.signals.includes(signal)) payload.signals.push(signal);
    }

    await this.prisma.ingestDraft.update({
      where: { id: row.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        messageIds: { push: BigInt(input.messageId) },
      },
    });

    const published = await this.maybeAutoPublish(row.id, payload);
    if (published) return published;

    if (fileName) return { action: 'file', draftId: row.id, fileName, payload };
    return { action: 'image', draftId: row.id, role: role ?? 'gallery', payload };
  }

  /**
   * The draft a new file or photo belongs to: a pending review first, then a
   * draft that already auto-published and is still collecting parts, so a
   * 20-part course is not cut in half by the first ZIP being enough to publish.
   * A media group always wins, because albums arrive out of order.
   */
  private async findOpenDraft(chatId: number, threadId: number | null, mediaGroupId?: string | null) {
    const rows = await this.prisma.ingestDraft.findMany({
      where: {
        chatId: BigInt(chatId),
        topicId: threadId === null ? null : BigInt(threadId),
        status: { in: ['pending', 'approved'] },
        createdAt: { gte: new Date(Date.now() - COLLECT_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    if (mediaGroupId) {
      for (const row of rows) {
        const payload = row.payload as unknown as DraftPayload;
        const inGroup = [...(payload.images ?? []), ...(payload.files ?? [])].some(
          (item) => item.mediaGroupId === mediaGroupId,
        );
        if (inGroup) return row;
      }
    }
    for (const row of rows) {
      const payload = row.payload as unknown as DraftPayload;
      // A photo-only placeholder is not a home for an unrelated ZIP.
      if (payload.signals.includes('needs-title')) continue;
      if (row.status === 'pending') return row;
      if (payload.autoPublished) return row;
    }
    return null;
  }

  /** The recent draft that already holds a frame of this album. */
  private async findDraftByMediaGroup(chatId: number, threadId: number | null, mediaGroupId: string) {
    const rows = await this.prisma.ingestDraft.findMany({
      where: {
        chatId: BigInt(chatId),
        topicId: threadId === null ? null : BigInt(threadId),
        status: { in: ['pending', 'approved'] },
        createdAt: { gte: new Date(Date.now() - COLLECT_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    for (const row of rows) {
      const payload = row.payload as unknown as DraftPayload;
      const inGroup = [...(payload.images ?? []), ...(payload.files ?? [])].some(
        (item) => item.mediaGroupId === mediaGroupId,
      );
      if (inGroup) return row;
    }
    return null;
  }

  /** A post published moments ago that still has no picture to lead with. */
  private async findRecentCoverlessDraft(chatId: number, threadId: number | null) {
    const rows = await this.prisma.ingestDraft.findMany({
      where: {
        chatId: BigInt(chatId),
        topicId: threadId === null ? null : BigInt(threadId),
        status: { in: ['pending', 'approved'] },
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    for (const row of rows) {
      const payload = row.payload as unknown as DraftPayload;
      if (!payload.images?.some((image) => image.role === 'cover')) return row;
    }
    return null;
  }

  /** Attach a picture to a specific draft (used for a late cover). */
  private async attachToDraft(
    row: { id: string; payload: Prisma.JsonValue },
    input: DraftIncoming,
  ): Promise<ObserveResult> {
    const payload = row.payload as unknown as DraftPayload;
    const role = this.attachImage(payload, input.image!, undefined, input.mediaGroupId ?? null);
    if (!role) return { action: 'ignored', reason: 'picture already attached' };

    await this.prisma.ingestDraft.update({
      where: { id: row.id },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        messageIds: { push: BigInt(input.messageId) },
      },
    });
    const published = await this.maybeAutoPublish(row.id, payload);
    if (published) return published;
    return { action: 'image', draftId: row.id, role, payload };
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

  /**
   * Record that the auto-publish receipt was drawn, so a late ZIP edits the
   * existing card instead of posting a second one. Reads the stored payload so
   * it cannot clobber `approvedCourseSlug`, which approval wrote.
   */
  async rememberNotice(draftId: string, messageId?: number): Promise<void> {
    const draft = await this.prisma.ingestDraft.findUnique({
      where: { id: draftId },
      select: { payload: true },
    });
    if (!draft) return;
    const payload = draft.payload as unknown as DraftPayload;
    if (!payload.signals.includes('auto-published-notice')) {
      payload.signals.push('auto-published-notice');
    }
    if (messageId) payload.cardMessageId = messageId;
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
   * Write the draft to the catalogue. Safe to call twice: for a course the
   * second call only attaches parts that arrived after the first; for a
   * resource it only adds new media.
   */
  async approve(
    idOrPrefix: string,
    actor?: { telegramId?: number | null; userId?: string | null },
  ): Promise<ApproveResult> {
    const draft = await this.find(idOrPrefix);
    if (draft.status === 'discarded') throw new BadRequestException('That draft was discarded');
    if (draft.status === 'failed') throw new BadRequestException('That draft failed; re-post it instead');

    const payload = draft.payload as unknown as DraftPayload;
    if (!payload?.announcement?.title?.trim()) throw new BadRequestException('Draft has no title');

    if ((payload.kind ?? 'course') === 'resource') {
      return this.approveResource(draft, payload, actor);
    }

    const title = (payload.fields?.title ?? payload.announcement.title).trim();

    if (draft.status === 'approved' && draft.approvedCourseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: draft.approvedCourseId },
        select: { id: true, slug: true, title: true, thumbnailUrl: true },
      });
      if (!course) throw new BadRequestException('The published course no longer exists');
      const attached = await this.attachFiles(course.id, payload, actor);
      const modules = new Set(
        (payload.files ?? []).map((f) => f.moduleTitle ?? ''),
      ).size;

      // A cover posted after the course published is still its cover.
      if (!course.thumbnailUrl && (payload.images ?? []).length > 0) {
        const resolved = await this.media.resolveMany(payload.images ?? []);
        const cover = this.resourceCover(payload, resolved);
        if (cover) {
          await this.prisma.course
            .update({ where: { id: course.id }, data: { thumbnailUrl: cover } })
            .catch(() => undefined);
        }
      }

      // A course can publish on its first ZIP, then keep receiving parts. Once
      // the fourth archive proves it is a full curriculum (not a mini-course),
      // the published row follows, unless an operator declared the type.
      if (payload.autoPublished && !payload.signals.includes('type-explicit')) {
        const nextType = courseKindFrom({
          text: payload.announcement.title,
          title: payload.announcement.title,
          durationMin: payload.announcement.durationMin,
          lessonCount: payload.announcement.lessonCount,
          fileCount: (payload.files ?? []).length,
          declared: null,
        });
        if (nextType) {
          payload.fields = { ...(payload.fields ?? {}), contentType: nextType };
          await this.prisma.course
            .update({ where: { id: course.id }, data: { contentType: courseTypeOf(nextType) } })
            .catch(() => undefined);
        }
      }
      return { alreadyApproved: true as const, course, filesAdded: attached, modules };
    }

    const images = await this.media.resolveRoles(payload.images ?? []);
    const lecturerIds = await this.upsertLecturers(
      payload.fields?.lecturerNames ?? payload.announcement.lecturerNames ?? [],
      { photoUrl: images.lecturer ?? null, bio: payload.fields?.lecturerBio ?? null },
    );

    // A course created from "Add to catalogue" and the same announcement
    // arriving through the watcher must converge on one row. Matching only on
    // the generated slug was not enough: a slightly different title produced a
    // second course, a second slug and a duplicate page.
    const equivalent = await this.findEquivalentCourse(title, lecturerIds);
    const slug = equivalent?.slug ?? (await this.uniqueSlug(draftSlug(title), title));

    const categories = await this.resolveCategories(
      payload.fields?.categorySlugs?.length ? payload.fields.categorySlugs : payload.categorySlugs ?? [],
    );
    const levelId = await this.resolveLevel(payload.fields?.levelName);
    const organizationId = await this.resolveOrganization(
      payload.fields?.organizationName,
      payload.fields?.organizationType,
      images.organization ?? null,
      payload.fields?.organizationDescription,
    );

    const description =
      (payload.fields?.description ?? payload.announcement.description ?? '').trim() ||
      `${title} — added from the ${payload.chat.username ? '@' + payload.chat.username : 'Telegram'} group.`;
    const price =
      payload.fields?.price !== undefined ? payload.fields.price : payload.announcement.originalPrice;
    const originalPrice =
      payload.fields?.originalPrice !== undefined ? payload.fields.originalPrice : payload.announcement.originalPrice;

    let course: { id: string; slug: string; title: string };
    let created = false;
    try {
      course = await this.prisma.$transaction(async (tx) => {
        let row = await tx.course.findUnique({ where: { slug } });
        created = !row;

        if (!row) {
          row = await tx.course.create({
            data: {
              title,
              slug,
              description,
              thumbnailUrl: payload.fields?.coverUrl ?? images.cover ?? null,
              language: payload.fields?.language ?? 'English',
              levelId,
              lecturerId: lecturerIds[0] ?? null,
              organizationId,
              originalPrice,
              price,
              baseRatingAvg: payload.announcement.ratingAvg ?? 0,
              baseRatingCount: payload.announcement.ratingCount ?? 0,
              ratingAvg: payload.announcement.ratingAvg ?? 0,
              ratingCount: payload.announcement.ratingCount ?? 0,
              sourceUrl: payload.fields?.sourceUrl ?? payload.announcement.sourceUrl ?? null,
              publishedAt: payload.announcement.postedAt
                ? new Date(payload.announcement.postedAt)
                : new Date(),
              isPremium: payload.fields?.isPremium ?? false,
              isFeatured: false,
              contentType: courseTypeOf(payload.fields?.contentType),
            },
          });
        } else {
          // A re-post can fill a gap, but must never rewrite an edited course.
          // That includes the announcement's rating: it is only copied into a
          // course that has none, so an existing local score is not replaced.
          const incomingAvg = payload.announcement.ratingAvg ?? 0;
          const incomingCount = payload.announcement.ratingCount ?? 0;
          row = await tx.course.update({
            where: { id: row.id },
            data: {
              sourceUrl: row.sourceUrl ?? payload.fields?.sourceUrl ?? payload.announcement.sourceUrl ?? null,
              originalPrice: row.originalPrice ?? originalPrice ?? null,
              price: row.price ?? price ?? null,
              thumbnailUrl: row.thumbnailUrl ?? payload.fields?.coverUrl ?? images.cover ?? null,
              levelId: row.levelId ?? levelId,
              organizationId: row.organizationId ?? organizationId,
              ...(row.ratingCount === 0 && incomingCount > 0
                ? {
                    baseRatingAvg: incomingAvg,
                    baseRatingCount: incomingCount,
                    ratingAvg: incomingAvg,
                    ratingCount: incomingCount,
                  }
                : {}),
              deletedAt: null,
            },
          });
        }

        for (const [orderIndex, lecturerId] of lecturerIds.entries()) {
          await tx.courseLecturer.upsert({
            where: { courseId_lecturerId: { courseId: row.id, lecturerId } },
            create: { courseId: row.id, lecturerId, orderIndex },
            update: {},
          });
        }
        if (!row.lecturerId && lecturerIds[0]) {
          await tx.course.update({ where: { id: row.id }, data: { lecturerId: lecturerIds[0] } });
        }

        // A failed insert inside a transaction aborts the whole transaction on
        // Postgres, so check first instead of catching a unique violation.
        const linked = await tx.courseCategory.findMany({
          where: { courseId: row.id },
          select: { categoryId: true },
        });
        const linkedIds = new Set(linked.map((c) => c.categoryId));
        for (const cat of categories) {
          if (linkedIds.has(cat.id)) continue;
          await tx.courseCategory.create({ data: { courseId: row.id, categoryId: cat.id } });
        }

        for (const tag of normalizeTags(payload.fields?.tags ?? payload.announcement.hashtags)) {
          const exists = await tx.courseTag.findFirst({ where: { courseId: row.id, tag } });
          if (!exists) await tx.courseTag.create({ data: { courseId: row.id, tag } });
        }

        return { id: row.id, slug: row.slug, title: row.title };
      }, { timeout: 30_000 });

      const filesAdded = await this.attachFiles(course.id, payload, actor);
      const modules = new Set((payload.files ?? []).map((f) => f.moduleTitle ?? '')).size;

      payload.approvedCourseSlug = course.slug;
      await this.prisma.ingestDraft.update({
        where: { id: draft.id },
        data: {
          status: 'approved',
          approvedCourseId: course.id,
          error: null,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `draft ${draft.id} approved → ${course.slug} (${filesAdded} files, ${modules} modules)`,
      );
      return {
        alreadyApproved: false as const,
        course,
        filesAdded,
        modules,
        created,
        categories: categories.map((c) => c.slug),
      };
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

  /**
   * A resource is one published post: a body and its attachments. It has no
   * curriculum and no price, which is why it cannot go through the course path.
   */
  private async approveResource(
    draft: { id: string; status: string; approvedCourseId: string | null },
    payload: DraftPayload,
    actor?: { telegramId?: number | null; userId?: string | null },
  ) {
    const title = (payload.fields?.title ?? payload.announcement.title).trim();
    const slug = await this.uniqueResourceSlug(draftSlug(title), title);

    if (draft.status === 'approved' && payload.approvedCourseSlug) {
      const existing = await this.prisma.resource.findUnique({
        where: { slug: payload.approvedCourseSlug },
        select: { id: true, slug: true, title: true, coverUrl: true },
      });
      if (existing) {
        // Resolve only pictures that are not stored yet: a ten-frame album
        // must not upload every frame again when the last one arrives.
        const stored = await this.prisma.resourceMedia.findMany({
          where: { resourceId: existing.id },
          select: { telegramFileId: true, url: true },
        });
        const known = new Map(
          stored.filter((m) => m.telegramFileId && m.url).map((m) => [m.telegramFileId as string, m.url as string]),
        );
        const resolved: Array<string | null> = [];
        for (const image of payload.images ?? []) {
          resolved.push(known.get(image.fileId) ?? (await this.media.resolve(image.fileId)));
        }
        const coverUrl = this.resourceCover(payload, resolved);
        if (!existing.coverUrl && coverUrl) {
          await this.prisma.resource.update({ where: { id: existing.id }, data: { coverUrl } });
        }
        const mediaAdded = await this.attachResourceMedia(existing.id, payload, resolved);
        return {
          alreadyApproved: true as const,
          resource: { id: existing.id, slug: existing.slug, title: existing.title },
          mediaAdded,
          filesAdded: mediaAdded,
          modules: 0,
        };
      }
    }

    try {
      const resolved = await this.media.resolveMany(payload.images ?? []);
      const lecturerPhoto = this.imageByRole(payload, resolved, 'lecturer');
      const logo = this.imageByRole(payload, resolved, 'organization');
      const coverUrl = this.resourceCover(payload, resolved);
      const lecturerIds = await this.upsertLecturers(payload.fields?.lecturerNames ?? [], {
        photoUrl: lecturerPhoto,
        bio: payload.fields?.lecturerBio ?? null,
      });
      const categories = await this.resolveCategories(
        payload.fields?.categorySlugs?.length ? payload.fields.categorySlugs : payload.categorySlugs ?? [],
      );
      const organizationId = await this.resolveOrganization(
        payload.fields?.organizationName,
        payload.fields?.organizationType,
        logo,
        payload.fields?.organizationDescription,
      );

      const body = (payload.fields?.description ?? payload.announcement.description ?? '').trim();
      const resource = await this.prisma.resource.create({
        data: {
          type: resourceTypeOfValue(payload.fields?.resourceType),
          title,
          slug,
          summary: (payload.fields?.resourceSummary ?? body).slice(0, 200) || null,
          bodyMd: body,
          coverUrl,
          categoryId: categories[0]?.id ?? null,
          organizationId,
          lecturerId: lecturerIds[0] ?? null,
          isPremium: payload.fields?.isPremium ?? false,
          sourceUrl: payload.fields?.sourceUrl ?? payload.announcement.sourceUrl ?? null,
          publishedAt: payload.announcement.postedAt ? new Date(payload.announcement.postedAt) : new Date(),
        },
        select: { id: true, slug: true, title: true },
      });

      const mediaAdded = await this.attachResourceMedia(resource.id, payload, resolved);
      payload.approvedCourseSlug = resource.slug;
      await this.prisma.ingestDraft.update({
        where: { id: draft.id },
        data: {
          status: 'approved',
          approvedCourseId: null,
          error: null,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`draft ${draft.id} approved → resource ${resource.slug} (${mediaAdded} media)`);
      return {
        alreadyApproved: false as const,
        resource,
        mediaAdded,
        filesAdded: mediaAdded,
        modules: 0,
        created: true,
      };
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      await this.prisma.ingestDraft.update({
        where: { id: draft.id },
        data: { status: 'failed', error: message },
      });
      this.logger.error(`draft ${draft.id} resource approve failed: ${message}`);
      throw err;
    }
  }

  /** Attach every draft file that is not already linked. Returns the new count. */
  private async attachFiles(
    courseId: string,
    payload: DraftPayload,
    actor?: { telegramId?: number | null; userId?: string | null },
  ): Promise<number> {
    const files = payload.files ?? [];
    if (files.length === 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.telegramCourseLink.findMany({
        where: { courseId },
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
          courseId,
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
      return rows.length;
    }, { timeout: 30_000 });
  }

  /**
   * The URL a resource page leads with: an explicit `cover:` line wins, then
   * the picture posted with the announcement, then the first album frame.
   */
  private resourceCover(payload: DraftPayload, resolved: Array<string | null>): string | null {
    const explicit = (payload.fields?.coverUrl ?? '').trim();
    if (/^https?:\/\//i.test(explicit)) return explicit;
    return (
      this.imageByRole(payload, resolved, 'cover') ??
      this.imageByRole(payload, resolved, 'gallery')
    );
  }

  /** The resolved URL of one picture role, or null when it was not posted. */
  private imageByRole(
    payload: DraftPayload,
    resolved: Array<string | null>,
    role: DraftImageRole,
  ): string | null {
    const images = payload.images ?? [];
    for (let i = 0; i < images.length; i++) {
      if (images[i].role === role && resolved[i]) return resolved[i] ?? null;
    }
    return null;
  }

  /**
   * One row per picture and per attachment. A photo post is nothing but its
   * pictures, so image rows are written first and keep the album's order; the
   * files (video, audio, epub, zip) follow. Deduped by Telegram file id.
   */
  private async attachResourceMedia(
    resourceId: string,
    payload: DraftPayload,
    resolved: Array<string | null> = [],
  ): Promise<number> {
    const images = payload.images ?? [];
    const files = payload.files ?? [];
    if (images.length === 0 && files.length === 0) return 0;

    // Non-image media used to be stored with only a Telegram `file_id`, so the
    // resource page had nothing to render. Mirror what the Bot API can hand
    // over (≤19 MB); a larger file keeps its id and is delivered by the bot's
    // deep link instead. Done before the transaction, because an upload must
    // not hold a database transaction open.
    const current = await this.prisma.resourceMedia.findMany({
      where: { resourceId },
      select: { telegramFileId: true, url: true },
    });
    const alreadyMirrored = new Set(
      current.filter((m) => m.telegramFileId && m.url).map((m) => m.telegramFileId as string),
    );
    const mirrored = new Map<string, string>();
    for (const file of files) {
      if (alreadyMirrored.has(file.fileId)) continue;
      const url = await this.media.resolveFile(file);
      if (url) mirrored.set(file.fileId, url);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.resourceMedia.findMany({
        where: { resourceId },
        select: { telegramFileId: true, fileName: true, url: true },
      });
      const seen = new Set(
        existing.map((m) => `${m.telegramFileId ?? m.url ?? ''}\u0000${m.fileName ?? ''}`),
      );
      const existingByFile = new Map(
        existing.filter((m) => m.telegramFileId).map((m) => [m.telegramFileId as string, m]),
      );
      let orderIndex = existing.length;

      const rows: Prisma.ResourceMediaCreateManyInput[] = [];
      const fillUrls: Array<{ fileId: string; url: string }> = [];
      images.forEach((image, index) => {
        const already = existingByFile.get(image.fileId);
        if (already) {
          // A row whose upload failed before gets its URL now.
          if (!already.url && resolved[index]) fillUrls.push({ fileId: image.fileId, url: resolved[index] as string });
          return;
        }
        const key = `${image.fileId}\u0000`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          resourceId,
          kind: 'image',
          url: resolved[index] ?? null,
          telegramFileId: image.fileId,
          fileName: null,
          fileSizeMb: null,
          caption: image.caption ?? null,
          orderIndex: orderIndex++,
        });
      });
      for (const fill of fillUrls) {
        await tx.resourceMedia.updateMany({
          where: { resourceId, telegramFileId: fill.fileId, url: null },
          data: { url: fill.url },
        });
      }
      // A row written before mirroring existed gets its URL now, even when the
      // file was attached in an earlier webhook and is not created again here.
      for (const [fileId, url] of mirrored) {
        await tx.resourceMedia.updateMany({
          where: { resourceId, telegramFileId: fileId, url: null },
          data: { url },
        });
      }

      for (const file of files) {
        const key = `${file.fileId}\u0000${file.fileName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          resourceId,
          kind: mediaKindOf(file.mimeType, file.fileName),
          url: mirrored.get(file.fileId) ?? null,
          telegramFileId: file.fileId,
          fileName: file.fileName,
          fileSizeMb: file.fileSizeMb,
          orderIndex: orderIndex++,
        });
      }
      if (rows.length > 0) await tx.resourceMedia.createMany({ data: rows });
      return rows.length;
    }, { timeout: 30_000 });
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

  /**
   * Upsert every credited teacher, in the order the post lists them. A photo
   * and bio are attached to the first name only — a group photo is not a
   * portrait of each co-teacher.
   */
  private async upsertLecturers(
    names: string[],
    extras: { photoUrl?: string | null; bio?: string | null } = {},
  ): Promise<string[]> {
    const ids: string[] = [];
    const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].slice(0, 4);
    for (const [index, name] of clean.entries()) {
      const slug = draftSlug(name);
      const patch =
        index === 0
          ? {
              ...(extras.photoUrl ? { photoUrl: extras.photoUrl } : {}),
              ...(extras.bio ? { bio: extras.bio } : {}),
            }
          : {};
      const lecturer = await this.prisma.lecturer.upsert({
        where: { slug },
        update: patch,
        create: { name, slug, socialLinks: '{}', ...patch },
        select: { id: true },
      });
      if (!ids.includes(lecturer.id)) ids.push(lecturer.id);
    }
    return ids;
  }

  /**
   * Resolve the categories a post asked for, creating ones that do not exist
   * yet. `newCourse` already behaves this way, so a typo becomes a category
   * rather than a silently uncategorised course.
   */
  private async resolveCategories(raw: string[]): Promise<{ id: string; slug: string }[]> {
    const out: { id: string; slug: string }[] = [];
    for (const value of [...new Set(raw.map((v) => v.trim()).filter(Boolean))].slice(0, 4)) {
      const slug = slugify(value) || value.toLowerCase();
      if (!slug) continue;
      const existing = await this.prisma.category.findUnique({ where: { slug }, select: { id: true, slug: true } });
      if (existing) {
        out.push(existing);
        continue;
      }
      const name = value
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 60);
      const created = await this.prisma.category.create({
        data: { name, slug, icon: '📚' },
        select: { id: true, slug: true },
      });
      out.push(created);
    }
    return out;
  }

  /** Levels are a small fixed set; an unknown value is left unset rather than invented. */
  private async resolveLevel(name?: string): Promise<string | null> {
    const wanted = (name ?? '').trim();
    if (!wanted) return null;
    const found = await this.prisma.level.findFirst({
      where: { name: { equals: wanted, mode: 'insensitive' } },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  private async resolveOrganization(
    name?: string,
    orgType?: string,
    logoUrl?: string | null,
    description?: string,
  ): Promise<string | null> {
    const clean = (name ?? '').trim();
    if (clean.length < 2) return null;
    const slug = draftSlug(clean);
    const type = ['university', 'company', 'publisher'].includes((orgType ?? '').toLowerCase())
      ? orgType!.toLowerCase()
      : 'publisher';
    const org = await this.prisma.organization.upsert({
      where: { slug },
      update: {
        ...(logoUrl ? { logoUrl } : {}),
        ...(description ? { description } : {}),
      },
      create: {
        name: clean.slice(0, 120),
        slug,
        orgType: type,
        logoUrl: logoUrl ?? null,
        description: description ?? null,
      },
      select: { id: true },
    });
    return org.id;
  }

  /**
   * Find the row an announcement is really about. Title alone is not enough
   * when two courses share a name, so a conflicting lecturer credit blocks the
   * merge; a shared lecturer or an unambiguous single match allows it.
   */
  private async findEquivalentCourse(
    title: string,
    lecturerIds: string[],
  ): Promise<{ id: string; slug: string; title: string } | null> {
    const wanted = normalizeCourseTitle(title);
    if (wanted.length < 8) return null;

    const rows = await this.prisma.course.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        lecturers: { select: { lecturerId: true } },
      },
      take: 1000,
    });
    const sameTitle = rows.filter((row) => normalizeCourseTitle(row.title) === wanted);
    if (sameTitle.length === 0) return null;

    const incoming = new Set(lecturerIds);
    const sharesLecturer = (row: (typeof sameTitle)[number]) =>
      incoming.size > 0 && row.lecturers.some((l) => incoming.has(l.lecturerId));

    if (sameTitle.length === 1) {
      const [row] = sameTitle;
      // One course with the same title but a completely different lecturer is
      // a different course, not a duplicate.
      if (incoming.size > 0 && row.lecturers.length > 0 && !sharesLecturer(row)) return null;
      return row;
    }

    const withLecturer = sameTitle.filter(sharesLecturer);
    return withLecturer.length === 1 ? withLecturer[0] : null;
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

  private async uniqueResourceSlug(base: string, title: string): Promise<string> {
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.prisma.resource.findUnique({
        where: { slug },
        select: { title: true },
      });
      if (!existing || existing.title === title) return slug;
      slug = `${base}-${n++}`;
    }
  }

  /**
   * Tap-to-fix: one field of a pending draft is replaced by what the operator
   * typed (or by a photo's file id for the image fields). Returns the updated
   * payload so the caller can redraw the card in place.
   */
  async updateField(
    idOrPrefix: string,
    field: DraftFieldKey | 'lecturerImage' | 'organizationLogo' | 'coverImage',
    value: string,
  ): Promise<{ draftId: string; payload: DraftPayload }> {
    const draft = await this.find(idOrPrefix);
    if (draft.status !== 'pending') {
      throw new BadRequestException('Only a draft that is still waiting for review can be edited');
    }
    const payload = draft.payload as unknown as DraftPayload;
    payload.fields ??= {};
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException('The new value is empty');
    // The image cases accept a Telegram file id, not a caption. A pasted URL or
    // a sentence would be stored as an id and silently render nothing.
    if (['coverImage', 'lecturerImage', 'organizationLogo'].includes(field) && /\s/.test(trimmed)) {
      throw new BadRequestException('Send the photo itself — a file id, not text');
    }

    switch (field) {
      case 'title':
        payload.fields.title = trimmed.slice(0, 200);
        payload.announcement.title = payload.fields.title;
        payload.announcement.slug = draftSlug(payload.fields.title);
        break;
      case 'description':
        payload.fields.description = trimmed.slice(0, 8_000);
        payload.announcement.description = payload.fields.description;
        break;
      case 'lecturerNames':
        payload.fields.lecturerNames = splitNames(trimmed);
        payload.announcement.lecturerNames = payload.fields.lecturerNames;
        break;
      case 'lecturerBio':
        payload.fields.lecturerBio = trimmed.slice(0, 2_000);
        break;
      case 'organizationName':
        payload.fields.organizationName = trimmed.slice(0, 120);
        break;
      case 'organizationType':
        payload.fields.organizationType = trimmed.toLowerCase();
        break;
      case 'organizationDescription':
        payload.fields.organizationDescription = trimmed.slice(0, 2_000);
        break;
      case 'categorySlugs':
        payload.fields.categorySlugs = splitList(trimmed).map(slugify).filter(Boolean).slice(0, 4);
        payload.categorySlugs = payload.fields.categorySlugs;
        break;
      case 'levelName':
        payload.fields.levelName = trimmed;
        break;
      case 'contentType':
        payload.fields.contentType = trimmed.toLowerCase();
        break;
      case 'price': {
        if (/^(free|none)$/i.test(trimmed)) payload.fields.price = null;
        else {
          const n = parseMoney(trimmed);
          if (n === undefined) throw new BadRequestException('Price should be a number or "free"');
          payload.fields.price = n;
        }
        payload.announcement.originalPrice = payload.fields.price ?? null;
        break;
      }
      case 'originalPrice': {
        const n = parseMoney(trimmed);
        if (n === undefined) throw new BadRequestException('Original price should be a number or "free"');
        payload.fields.originalPrice = n;
        break;
      }
      case 'tags':
        payload.fields.tags = splitList(trimmed).slice(0, 8);
        payload.announcement.hashtags = payload.fields.tags;
        break;
      case 'language':
        payload.fields.language = trimmed.slice(0, 40);
        break;
      case 'isPremium':
        payload.fields.isPremium = /^(true|yes|1|premium)$/i.test(trimmed);
        break;
      case 'resourceType':
        payload.fields.resourceType = trimmed.toLowerCase();
        payload.kind = 'resource';
        break;
      case 'resourceSummary':
        payload.fields.resourceSummary = trimmed.slice(0, 200);
        break;
      case 'sourceUrl':
        payload.fields.sourceUrl = trimmed;
        payload.announcement.sourceUrl = trimmed;
        break;
      case 'coverUrl':
        payload.fields.coverUrl = /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
        break;
      case 'coverImage':
        payload.images = upsertImage(payload.images, {
          role: 'cover',
          fileId: trimmed,
          messageId: 0,
          caption: null,
        });
        break;
      case 'lecturerImage':
        payload.images = upsertImage(payload.images, {
          role: 'lecturer',
          fileId: trimmed,
          messageId: 0,
          caption: null,
        });
        break;
      case 'organizationLogo':
        payload.images = upsertImage(payload.images, {
          role: 'organization',
          fileId: trimmed,
          messageId: 0,
          caption: null,
        });
        break;
    }

    await this.prisma.ingestDraft.update({
      where: { id: draft.id },
      data: { payload: payload as unknown as Prisma.InputJsonValue },
    });
    return { draftId: draft.id, payload };
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

// ---------------------------------------------------------------------------
// Small readers shared by the announcement and tap-to-fix paths
// ---------------------------------------------------------------------------

/** "A, B & C" → ["A", "B", "C"], capped the same way `splitLecturers` is. */
function splitNames(input: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of input.split(/[,&/]/)) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names.slice(0, 4);
}

function splitList(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `$19.99` / `19.99` / `free` → 19.99 / null; `undefined` when unreadable. */
function parseMoney(input?: string): number | null | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (/^(free|none|included|\$?0(?:\.0+)?)$/i.test(trimmed)) return null;
  const n = Number(trimmed.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Hashtags arrive with or without `#`; the schema wants neither. */
function normalizeTags(tags: string[] = []): string[] {
  return [...new Set(tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 8);
}

function courseTypeOf(value?: string): string {
  return value === 'mini-course' ? 'mini-course' : 'course';
}

function resourceTypeOfValue(value?: string): string {
  const v = (value ?? '').toLowerCase();
  if (v === 'roadmap' || v === 'path') return 'roadmap';
  if (v === 'note' || v === 'notes') return 'note';
  return 'cheat-sheet';
}

/**
 * A course part archive (ZIP/RAR/7z). Videos, audio, PDFs and epubs are post
 * media, never module archives, so they open a resource instead of being
 * attached to whatever draft happens to be open.
 */
function isArchiveFile(file: { fileName: string; mimeType: string | null }): boolean {
  const ext = (file.fileName.split('.').pop() ?? '').toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(ext)) return true;
  // Books and office files are post media even when their mime type mentions
  // zip (`application/epub+zip`), and must never trigger a course upgrade.
  if (
    [
      'epub', 'mobi', 'azw3', 'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md',
      'ppt', 'pptx', 'odp', 'key', 'xls', 'xlsx', 'csv', 'ods',
      'mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'ogg',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    ].includes(ext)
  ) {
    return false;
  }
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return false;
  return /(?:zip|rar|7z|tar|gzip|x-compressed)/.test(mime);
}

/** Map a Telegram attachment to the viewer the resource page should open. */
function mediaKindOf(mime: string | null, fileName: string): string {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (m.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return 'video';
  if (m.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'epub', 'mobi', 'azw3'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slide';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['js', 'ts', 'py', 'json', 'html', 'css', 'sh', 'sql'].includes(ext)) return 'code';
  return 'other';
}

function upsertImage(
  images: DraftImage[] | undefined,
  next: DraftImage,
): DraftImage[] {
  const list = images ?? [];
  const at = list.findIndex((i) => i.role === next.role);
  if (at >= 0) list[at] = next;
  else list.push(next);
  return list;
}
