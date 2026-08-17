import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    message_thread_id?: number;
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
    document?: { file_id: string; file_name?: string; file_size?: number };
    video?: { file_id: string; file_name?: string; file_size?: number };
    audio?: { file_id: string; file_name?: string; file_size?: number };
    reply_to_message?: {
      message_id: number;
      message_thread_id?: number;
      document?: { file_id: string; file_name?: string; file_size?: number };
      video?: { file_id: string; file_name?: string; file_size?: number };
      audio?: { file_id: string; file_name?: string; file_size?: number };
    };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
  };
}

interface TelegramMessage {
  ok: boolean;
  result?: {
    message_id: number;
    chat?: { id: number; username?: string };
    message_thread_id?: number;
    document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
    video?: { file_id: string; file_name?: string; file_size?: number };
    audio?: { file_id: string; file_name?: string; file_size?: number };
    text?: string;
    caption?: string;
  };
  description?: string;
}

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'syncourse_bot';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TelegramBot');
  private polling = false;
  private stopped = false;
  private lastPollAt: Date | null = null;
  private lastUpdateAt: Date | null = null;
  private pollErrors = 0;
  private lastError: { at: string; message: string; stack?: string } | null = null;
  /** Per-user cache of the most recent file the user forwarded/sent to the bot —
   *  keyed by Telegram user id so `/link` works from any chat (DM, group, topic). */
  private lastFileByUser = new Map<
    number,
    { messageId: number; fileId: string; fileName: string | null; fileSize: number | null }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private get token(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  private get enabled(): boolean {
    return Boolean(this.token);
  }

  private api(method: string, body?: unknown): Promise<Response> {
    return fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
      return;
    }
    this.polling = true;
    // small delay so the HTTP server is ready before the first request
    setTimeout(() => void this.pollLoop(), 3000);
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  private async pollLoop() {
    let offset = 0;
    let conflictBackoff = 0;
    while (this.polling && !this.stopped) {
      try {
        this.lastPollAt = new Date();
        const res = await fetch(
          `https://api.telegram.org/bot${this.token}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(
            JSON.stringify(['message', 'callback_query']),
          )}`,
        );
        const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
        if (!data.ok) {
          if (data.description?.includes('409')) {
            // Another instance (old deploy) holds the poll lock. It will die on
            // its own during the deploy — back off and RETRY instead of giving
            // up forever, otherwise the bot stays dead after every redeploy.
            conflictBackoff = Math.min(conflictBackoff + 5, 60);
            this.pollErrors++;
            this.logger.warn(`409 conflict (another instance polling) — retrying in ${conflictBackoff}s`);
            await this.sleep(conflictBackoff * 1000);
            continue;
          }
          conflictBackoff = 0;
          this.pollErrors++;
          this.logger.warn(`getUpdates failed: ${data.description}`);
          await this.sleep(2000);
          continue;
        }
        conflictBackoff = 0;
        const updates = data.result ?? [];
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          this.lastUpdateAt = new Date();
          try {
            await this.handleUpdate(update);
          } catch (err) {
            this.pollErrors++;
            const e = err as Error;
            this.lastError = { at: new Date().toISOString(), message: e.message, stack: e.stack };
            this.logger.error(`update ${update.update_id} failed: ${e.message}\n${e.stack ?? ''}`);
          }
        }
      } catch (err) {
        if (this.stopped) return;
        this.pollErrors++;
        this.logger.warn(`poll error: ${(err as Error).message} — retrying`);
        await this.sleep(2000);
      }
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------------------------------------------------------------
  // Update dispatch
  // ---------------------------------------------------------------

  private async handleUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }
    const msg = update.message;
    if (!msg) return;
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id ?? null;

    // Cache the most recent file per USER so `/link <slug>` works as a plain
    // message right after forwarding a ZIP anywhere (no reply gesture needed).
    const msgDoc = msg.document ?? msg.video ?? msg.audio;
    const fileOwner = msg.from?.id ?? chatId;
    if (msgDoc) {
      this.lastFileByUser.set(fileOwner, {
        messageId: msg.message_id,
        fileId: msgDoc.file_id,
        fileName: msgDoc.file_name ?? null,
        fileSize: msgDoc.file_size ?? null,
      });
    }

    if (!msg.text) return;
    const fromId = msg.from?.id ?? chatId;
    const text = msg.text.trim();
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();

    switch (command) {
      case '/start': {
        const payload = arg.replace(/^@\w+\s*/, '');
        if (payload.startsWith('dl_')) {
          await this.sendCourseFile(chatId, payload.slice(3), threadId);
        } else if (payload.startsWith('download_')) {
          await this.sendLessonLink(chatId, payload.slice(9));
        } else {
          await this.sendText(chatId, welcomeMessage(), threadId);
        }
        break;
      }
      case '/help':
        await this.sendText(chatId, helpMessage(), threadId);
        break;
      case '/courses':
        await this.sendCourseList(chatId, threadId);
        break;
      case '/link':
        if (await this.isAdmin(fromId)) await this.linkCourse(chatId, arg, msg, threadId, fromId);
        else await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        break;
      case '/unlink':
        if (await this.isAdmin(fromId)) await this.unlinkCourse(chatId, arg, threadId);
        else await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        break;
      case '/newcourse':
        if (await this.isAdmin(fromId)) await this.newCourse(chatId, arg, threadId);
        else await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        break;
      case '/broadcast':
        if (await this.isAdmin(fromId)) await this.broadcast(chatId, arg, threadId);
        else await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        break;
      default:
        if (text.startsWith('/')) {
          await this.sendText(chatId, `Unknown command. Send /help for the list of commands.`, threadId);
        }
    }
  }

  private async handleCallback(cb: NonNullable<TelegramUpdate['callback_query']>) {
    const chatId = cb.message?.chat.id ?? cb.from.id;
    const data = cb.data ?? '';
    try {
      await this.api('answerCallbackQuery', { callback_query_id: cb.id });
    } catch {
      /* ignore */
    }
    if (data.startsWith('dl:')) {
      await this.sendCourseFile(chatId, data.slice(3));
    }
  }

  // ---------------------------------------------------------------
  // Admin commands
  // ---------------------------------------------------------------

  private async isAdmin(fromId: number): Promise<boolean> {
    const envAdmins = (process.env.TELEGRAM_ADMIN_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    if (envAdmins.includes(fromId)) return true;
    const staff = await this.prisma.user.findFirst({
      where: { telegramId: BigInt(fromId), isStaff: true },
      select: { id: true },
    });
    return Boolean(staff);
  }

  /**
   * /link <course-slug> [t.me link]
   * Easiest: in the group, REPLY to the ZIP message with /link <course-slug> —
   * the bot grabs the file straight from the reply. Alternatively pass a
   * t.me/group/TOPIC/MESSAGE link in the DM.
   */
  private async linkCourse(
    chatId: number,
    arg: string,
    msg?: NonNullable<TelegramUpdate['message']>,
    threadId?: number | null,
    fromId?: number,
  ) {
    const slug = arg.split(/\s+/)[0] ?? '';
    if (!slug || slug.includes('<') || slug.includes('>')) {
      return this.sendText(
        chatId,
        'Usage (easiest): in the group, REPLY to the ZIP message with:\n/link <course-slug>\n\nor in the DM:\n/link <course-slug> <t.me/group/TOPIC/MESSAGE link>\n\nReplace <course-slug> with a REAL slug from this list:\n\n' +
          (await this.courseSlugList()),
        threadId,
      );
    }
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, deletedAt: true },
    });
    if (!course || course.deletedAt) {
      return this.sendText(
        chatId,
        `Course “${slug}” not found. Choose a real slug from this list:\n\n${await this.courseSlugList()}`,
        threadId,
      );
    }

    // Mode 1: a file to attach — from a reply, or the last file forwarded to
    // this chat (so `/link <slug>` works as a plain message right after
    // forwarding the ZIP to the bot).
    const reply = msg?.reply_to_message;
    const replyDoc = reply ? (reply.document ?? reply.video ?? reply.audio) : undefined;
    const cached = fromId ? this.lastFileByUser.get(fromId) : undefined;
    const doc = replyDoc
      ? { file_id: replyDoc.file_id, file_name: replyDoc.file_name, file_size: replyDoc.file_size }
      : cached && !reply
        ? { file_id: cached.fileId, file_name: cached.fileName, file_size: cached.fileSize }
        : null;
    if (doc) {
      const sourceName = replyDoc ? 'the file you replied to' : 'the last file you sent/forwarded to the bot';
      await this.saveLink({
        courseId: course.id,
        chatId: BigInt(chatId),
        chatUsername: msg?.chat.username ?? null,
        messageThreadId: reply?.message_thread_id ? BigInt(reply.message_thread_id) : null,
        fileMessageId: BigInt(reply?.message_id ?? msg?.message_id ?? 0),
        fileId: doc.file_id,
        fileName: doc.file_name ?? null,
        fileSizeMb: doc.file_size ? Number((doc.file_size / 1024 / 1024).toFixed(1)) : null,
        caption: null,
      });
      return this.sendText(
        chatId,
        `✅ Linked “${course.title}” to ${sourceName} (${doc.file_name ?? 'file'}${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}).\n\nUsers can now get it with /download ${slug} or from the app.`,
        threadId,
      );
    }
    if (reply) {
      return this.sendText(chatId, 'The message you replied to does not contain a file (ZIP/video/audio). Reply to the file message itself.', threadId);
    }

    // Mode 2: no file cached yet — guide the admin clearly.
    const url = arg.split(/\s+/)[1] ?? '';
    if (!url) {
      return this.sendText(
        chatId,
        'I don\'t have a file for that yet. Two easy ways:\n\n' +
          '1️⃣ Forward the course ZIP to this bot (any chat), then send /link <slug> again\n' +
          '2️⃣ Reply to the ZIP message in the group with /link <slug>\n\n' +
          'Example:\nForward the ZIP → then: /link complete-machine-learning-and-data-science-2021',
        threadId,
      );
    }
    const parsed = parseTelegramLink(url);
    if (!parsed) return this.sendText(chatId, 'Could not parse that t.me link. It should look like https://t.me/group/2/41', threadId);

    try {
      // Resolve the chat (username or numeric id) to a chat id
      let chatResolve = parsed.chatUsername
        ? await this.api('getChat', { chat_id: `@${parsed.chatUsername}` })
        : await this.api('getChat', { chat_id: parsed.chatId });
      const chatJson = (await chatResolve.json()) as { ok: boolean; result?: { id: number; username?: string }; description?: string };
      if (!chatJson.ok) return this.sendText(chatId, `Could not resolve the group: ${chatJson.description}`, threadId);
      const groupChatId = chatJson.result!.id;

      const msgRes = await this.api('getMessage', {
        chat_id: groupChatId,
        message_id: parsed.messageId,
      });
      const msgJson = (await msgRes.json()) as TelegramMessage;
      if (!msgJson.ok || !msgJson.result) {
        return this.sendText(
          chatId,
          `Could not read message ${parsed.messageId} in that group (${msgJson.description ?? 'not found'}).\n\nThe link must point at the actual file message — open the ZIP in the group topic → tap it → Copy link. That link looks like t.me/syncourse/<topic-id>/<message-id> with the real numbers, not the example 2/41.`,
          threadId,
        );
      }
      const m = msgJson.result;
      const doc = m.document ?? m.video ?? m.audio;
      if (!doc) {
        return this.sendText(chatId, 'That message does not contain a file (document/video/audio). Attach a ZIP or video and try again.', threadId);
      }

      await this.saveLink({
        courseId: course.id,
        chatId: BigInt(groupChatId),
        chatUsername: parsed.chatUsername ?? chatJson.result?.username ?? null,
        messageThreadId: parsed.messageThreadId ? BigInt(parsed.messageThreadId) : null,
        fileMessageId: BigInt(parsed.messageId),
        fileId: doc.file_id,
        fileName: doc.file_name ?? null,
        fileSizeMb: doc.file_size ? Number((doc.file_size / 1024 / 1024).toFixed(1)) : null,
        caption: m.caption ?? null,
      });
      return this.sendText(
        chatId,
        `✅ Linked “${course.title}”\n📦 ${doc.file_name ?? 'file'}${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}\n\nUsers can now get it with /download ${slug} or from the app.`,
        threadId,
      );
    } catch (err) {
      this.logger.error(`link failed: ${(err as Error).message}`);
      return this.sendText(chatId, 'Something went wrong while linking. Check the bot has access to the group.', threadId);
    }
  }

  private async unlinkCourse(chatId: number, slug: string, threadId?: number | null) {
    if (!slug) return this.sendText(chatId, 'Usage: /unlink <course-slug>', threadId);
    const course = await this.prisma.course.findUnique({ where: { slug }, select: { id: true, title: true } });
    if (!course) return this.sendText(chatId, `Course “${slug}” not found.`, threadId);
    await this.prisma.telegramCourseLink.deleteMany({ where: { courseId: course.id } });
    return this.sendText(chatId, `Unlinked “${course.title}” — the Telegram file is no longer served.`, threadId);
  }

  /**
   * /newcourse Title | Instructor | Category | contentType | price | imageUrl
   * Creates a course that immediately appears on the site.
   */
  private async newCourse(chatId: number, arg: string, threadId?: number | null) {
    const parts = arg.split('|').map((p) => p.trim());
    const [title, instructor, category, contentType, price, imageUrl] = parts;
    if (!title || !instructor) {
      return this.sendText(
        chatId,
        'Usage:\n/newcourse Course Title | Instructor Name | Category | course|mini-course|cheat-sheet|roadmap | price | image-url\n\nOnly Title and Instructor are required.',
        threadId,
      );
    }
    try {
      const lecturer = await this.prisma.lecturer.upsert({
        where: { slug: slugify(instructor) },
        update: {},
        create: { name: instructor, slug: slugify(instructor) },
      });
      const level = await this.prisma.level.findFirst({ where: { name: 'Beginner' } });
      const slug = await this.uniqueCourseSlug(slugify(title));
      const categoryRow = category
        ? await this.prisma.category.upsert({
            where: { slug: slugify(category) },
            update: {},
            create: { name: category, slug: slugify(category), icon: '📚' },
          })
        : null;
      const course = await this.prisma.course.create({
        data: {
          title,
          slug,
          description: `Learn ${title} — brought to you by Syncourse. Start learning today.`,
          lecturerId: lecturer.id,
          levelId: level?.id ?? null,
          contentType: ['mini-course', 'cheat-sheet', 'roadmap'].includes(contentType) ? contentType : 'course',
          price: price ? Number(price) : null,
          originalPrice: price ? Number(price) : null,
          thumbnailUrl: imageUrl || null,
          ...(categoryRow
            ? { categories: { create: [{ categoryId: categoryRow.id }] } }
            : {}),
        },
      });
      return this.sendText(
        chatId,
        `✅ Course created: “${course.title}”\n🔗 ${process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev'}/courses/${course.slug}\n\nNow attach the file with:\n/link ${course.slug} <t.me group link>`,
        threadId,
      );
    } catch (err) {
      this.logger.error(`newCourse failed: ${(err as Error).message}`);
      return this.sendText(chatId, 'Could not create the course — check the format and try again.', threadId);
    }
  }

  private async broadcast(chatId: number, text: string, threadId?: number | null) {
    if (!text) return this.sendText(chatId, 'Usage: /broadcast <message text>', threadId);
    const users = await this.prisma.user.findMany({
      where: { telegramId: { not: null } },
      select: { telegramId: true },
      take: 500,
    });
    let sent = 0;
    for (const u of users) {
      try {
        const res = await this.api('sendMessage', {
          chat_id: String(u.telegramId),
          text: `📢 ${text}`,
        });
        if ((await res.json()).ok) sent++;
      } catch {
        /* skip */
      }
    }
    return this.sendText(chatId, `Broadcast sent to ${sent}/${users.length} linked users.`, threadId);
  }

  // ---------------------------------------------------------------
  // User-facing download flow
  // ---------------------------------------------------------------

  /** Send the course file (or forward it) to a chat. */
  private async sendCourseFile(chatId: number, slug: string, threadId?: number | null) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, slug: true, ratingAvg: true, lecturer: { select: { name: true } } },
    });
    if (!course) return this.sendText(chatId, `Course “${slug}” not found. Try /courses.`);
    const link = await this.prisma.telegramCourseLink.findUnique({
      where: { courseId: course.id },
    });
    if (!link) {
      return this.sendText(chatId, 'This course has no Telegram file linked yet. Try again later — the team is adding files daily.');
    }
    const caption = courseCaption(course, link.fileName);
    try {
      if (link.fileId) {
        const body: Record<string, unknown> = {
          chat_id: chatId,
          document: link.fileId,
          caption,
        };
        if (threadId) body.message_thread_id = threadId;
        const res = await this.api('sendDocument', body);
        if (!(await res.json()).ok) throw new Error('sendDocument failed');
      } else {
        const res = await this.api('forwardMessage', {
          chat_id: chatId,
          from_chat_id: String(link.chatId),
          message_id: Number(link.fileMessageId),
        });
        if (!(await res.json()).ok) throw new Error('forwardMessage failed');
        await this.sendText(chatId, caption, threadId);
      }
      await this.prisma.course.update({
        where: { id: course.id },
        data: { downloadCount: { increment: 1 } },
      });
      const firstLesson = await this.prisma.lesson.findFirst({ where: { courseId: course.id }, select: { id: true } });
      await this.prisma.downloadEvent
        .create({
          data: {
            courseId: course.id,
            lessonId: firstLesson?.id ?? '',
            method: 'bot',
          },
        })
        .catch(() => undefined);
    } catch {
      return this.sendText(
        chatId,
        'Could not send the file. The bot may have lost access to the group — please contact support.',
      );
    }
  }

  /** start=download_<lessonId> — legacy flow: send the lesson link text. */
  private async sendLessonLink(chatId: number, lessonId: string, threadId?: number | null) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) return this.sendText(chatId, 'Lesson not found.', threadId);
    const appUrl = process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev';
    const text = `📚 Syncourse\n\n${lesson.course.title}\n${lesson.title}\n\n${appUrl}/courses/${lesson.course.slug}/lessons/${lesson.id}`;
    await this.sendText(chatId, text, threadId);
  }

  /** Numbered list of every course slug — shown when /link can't find one. */
  private async courseSlugList(): Promise<string> {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true },
      take: 60,
    });
    if (courses.length === 0) return 'No courses yet — create one with /newcourse.\n';
    return courses.map((c) => `• ${c.slug}`).join('\n') + '\n';
  }

  /** Upsert a course↔Telegram-file mapping. */
  private async saveLink(input: {
    courseId: string;
    chatId: bigint;
    chatUsername: string | null;
    messageThreadId: bigint | null;
    fileMessageId: bigint;
    fileId: string | null;
    fileName: string | null;
    fileSizeMb: number | null;
    caption: string | null;
  }) {
    await this.prisma.telegramCourseLink.upsert({
      where: { courseId: input.courseId },
      create: input,
      update: {
        chatId: input.chatId,
        chatUsername: input.chatUsername,
        messageThreadId: input.messageThreadId,
        fileMessageId: input.fileMessageId,
        fileId: input.fileId,
        fileName: input.fileName,
        fileSizeMb: input.fileSizeMb,
        caption: input.caption,
      },
    });
  }

  private async sendCourseList(chatId: number, threadId?: number | null) {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true, ratingAvg: true } } },
      take: 50,
    });
    if (links.length === 0) {
      return this.sendText(chatId, 'No courses linked yet. Ask an admin to link files with /link.', threadId);
    }
    const rows = links
      .map(
        (l, i) =>
          `${i + 1}. ${l.course.title} — /download ${l.course.slug}${l.fileName ? ` (${l.fileName})` : ''}`,
      )
      .join('\n');
    await this.sendText(chatId, `📚 Courses with Telegram files:\n\n${rows}`, threadId);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private async sendText(chatId: number, text: string, threadId?: number | null) {
    if (!this.enabled) return;
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        // IMPORTANT: no parse_mode. Telegram rejects messages containing raw
        // <angle brackets> when parse_mode=HTML, which made every /link reply
        // fail silently. Plain text is bulletproof.
        disable_web_page_preview: true,
      };
      if (threadId) body.message_thread_id = threadId;
      const res = await this.api('sendMessage', body);
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) {
        this.logger.error(`sendMessage rejected (${chatId}): ${json.description}`);
      }
    } catch (err) {
      this.logger.error(`sendMessage failed: ${(err as Error).message}`);
    }
  }

  private async uniqueCourseSlug(base: string): Promise<string> {
    let slug = base;
    let i = 2;
    while (await this.prisma.course.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${i}`;
      i++;
    }
    return slug;
  }

  /** Bot status + linked courses — used by the API /telegram/status endpoint. */
  async status() {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true } } },
    });
    return {
      enabled: this.enabled,
      polling: this.polling,
      botUsername: `@${BOT_USERNAME}`,
      lastPollAt: this.lastPollAt ? this.lastPollAt.toISOString() : null,
      lastUpdateAt: this.lastUpdateAt ? this.lastUpdateAt.toISOString() : null,
      pollErrors: this.pollErrors,
      lastError: this.lastError,
      linkedCourses: links.map((l) => ({
        slug: l.course.slug,
        title: l.course.title,
        fileName: l.fileName,
        chatUsername: l.chatUsername,
      })),
    };
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

function parseTelegramLink(
  url: string,
): { chatUsername?: string; chatId?: string; messageThreadId?: number; messageId: number } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 't.me') return null;
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length < 2) return null;
    const chat = segs[0];
    if (chat === 'c' && segs.length >= 3) {
      return { chatId: segs[1], messageThreadId: segs.length === 4 ? Number(segs[2]) : undefined, messageId: Number(segs[segs.length - 1]) };
    }
    if (segs.length === 2) return { chatUsername: chat, messageId: Number(segs[1]) };
    return { chatUsername: chat, messageThreadId: Number(segs[1]), messageId: Number(segs[2]) };
  } catch {
    return null;
  }
}

function courseCaption(
  course: { title: string; slug: string; ratingAvg: number; lecturer: { name: string } | null },
  fileName: string | null,
): string {
  const lines = [
    `🔰 ${course.title}`,
    `⭐ ${course.ratingAvg.toFixed(1)} / 5`,
    course.lecturer ? `👨‍🏫 Taught by ${course.lecturer.name}` : null,
    fileName ? `📦 ${fileName}` : null,
    ``,
    `More at syncourse.pages.dev/courses/${course.slug}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function welcomeMessage(): string {
  return (
    `👋 Welcome to Syncourse!\n\n` +
    `I send you course files straight to this chat.\n\n` +
    `• Get a course: send /courses to see what's available\n` +
    `• Download one: /download <slug>\n\n` +
    `Find the whole catalog at syncourse.pages.dev`
  );
}

function helpMessage(): string {
  return (
    `Syncourse bot\n\n` +
    `For everyone:\n` +
    `/courses — list courses with files\n` +
    `/download <slug> — get a course file\n\n` +
    `For admins:\n` +
    `/link <slug> <t.me link> — attach the file in a group topic to a course\n` +
    `/unlink <slug> — detach the file\n` +
    `/newcourse Title | Instructor | Category | type | price | image — create a course\n` +
    `/broadcast <text> — message all linked users\n\n` +
    `Example link: https://t.me/syncourse/2/41 (group → topic → message)`
  );
}
