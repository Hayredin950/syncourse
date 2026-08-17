import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
    reply_to_message?: { message_id: number };
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
    while (this.polling && !this.stopped) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${this.token}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(
            JSON.stringify(['message', 'callback_query']),
          )}`,
        );
        const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
        if (!data.ok) {
          if (data.description?.includes('409')) {
            this.logger.error('Bot is already being polled by another instance — stopping local polling.');
            this.polling = false;
            return;
          }
          this.logger.warn(`getUpdates failed: ${data.description}`);
          await this.sleep(2000);
          continue;
        }
        for (const update of data.result ?? []) {
          offset = Math.max(offset, update.update_id + 1);
          try {
            await this.handleUpdate(update);
          } catch (err) {
            this.logger.error(`update ${update.update_id} failed: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        if (this.stopped) return;
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
    if (!msg?.text) return;
    const chatId = msg.chat.id;
    const fromId = msg.from?.id ?? chatId;
    const text = msg.text.trim();
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();

    switch (command) {
      case '/start': {
        const payload = arg.replace(/^@\w+\s*/, '');
        if (payload.startsWith('dl_')) {
          await this.sendCourseFile(chatId, payload.slice(3));
        } else if (payload.startsWith('download_')) {
          await this.sendLessonLink(chatId, payload.slice(9));
        } else {
          await this.sendText(chatId, welcomeMessage());
        }
        break;
      }
      case '/help':
        await this.sendText(chatId, helpMessage());
        break;
      case '/courses':
        await this.sendCourseList(chatId);
        break;
      case '/link':
        if (await this.isAdmin(fromId)) await this.linkCourse(chatId, arg);
        else await this.sendText(chatId, '⛔ This command is for admins only.');
        break;
      case '/unlink':
        if (await this.isAdmin(fromId)) await this.unlinkCourse(chatId, arg);
        else await this.sendText(chatId, '⛔ This command is for admins only.');
        break;
      case '/newcourse':
        if (await this.isAdmin(fromId)) await this.newCourse(chatId, arg);
        else await this.sendText(chatId, '⛔ This command is for admins only.');
        break;
      case '/broadcast':
        if (await this.isAdmin(fromId)) await this.broadcast(chatId, arg);
        else await this.sendText(chatId, '⛔ This command is for admins only.');
        break;
      default:
        if (text.startsWith('/')) {
          await this.sendText(chatId, `Unknown command. Send /help for the list of commands.`);
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

  /** /link <course-slug> <t.me link to the file message in the group topic> */
  private async linkCourse(chatId: number, arg: string) {
    const [slug, url] = arg.split(/\s+/);
    if (!slug || !url) {
      return this.sendText(chatId, 'Usage: /link <course-slug> <t.me/group/TOPIC/MESSAGE link>');
    }
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, deletedAt: true },
    });
    if (!course || course.deletedAt) return this.sendText(chatId, `Course “${slug}” not found.`);

    const parsed = parseTelegramLink(url);
    if (!parsed) return this.sendText(chatId, 'Could not parse that t.me link. It should look like https://t.me/group/2/41');

    try {
      // Resolve the chat (username or numeric id) to a chat id
      let chatResolve = parsed.chatUsername
        ? await this.api('getChat', { chat_id: `@${parsed.chatUsername}` })
        : await this.api('getChat', { chat_id: parsed.chatId });
      const chatJson = (await chatResolve.json()) as { ok: boolean; result?: { id: number; username?: string }; description?: string };
      if (!chatJson.ok) return this.sendText(chatId, `Could not resolve the group: ${chatJson.description}`);
      const groupChatId = chatJson.result!.id;

      const msgRes = await this.api('getMessage', {
        chat_id: groupChatId,
        message_id: parsed.messageId,
      });
      const msgJson = (await msgRes.json()) as TelegramMessage;
      if (!msgJson.ok || !msgJson.result) {
        return this.sendText(
          chatId,
          `Could not read message ${parsed.messageId} in that group. Make sure the bot is a member of the group (with the topic visible) and the message contains a file.\n\n${msgJson.description ?? ''}`,
        );
      }
      const m = msgJson.result;
      const doc = m.document ?? m.video ?? m.audio;
      if (!doc) {
        return this.sendText(chatId, 'That message does not contain a file (document/video/audio). Attach a ZIP or video and try again.');
      }

      const upsert = await this.prisma.telegramCourseLink.upsert({
        where: { courseId: course.id },
        create: {
          courseId: course.id,
          chatId: BigInt(groupChatId),
          chatUsername: parsed.chatUsername ?? chatJson.result?.username ?? null,
          messageThreadId: parsed.messageThreadId ? BigInt(parsed.messageThreadId) : null,
          fileMessageId: BigInt(parsed.messageId),
          fileId: doc.file_id,
          fileName: doc.file_name ?? null,
          fileSizeMb: doc.file_size ? Number((doc.file_size / 1024 / 1024).toFixed(1)) : null,
          caption: m.caption ?? null,
        },
        update: {
          chatId: BigInt(groupChatId),
          chatUsername: parsed.chatUsername ?? chatJson.result?.username ?? null,
          messageThreadId: parsed.messageThreadId ? BigInt(parsed.messageThreadId) : null,
          fileMessageId: BigInt(parsed.messageId),
          fileId: doc.file_id,
          fileName: doc.file_name ?? null,
          fileSizeMb: doc.file_size ? Number((doc.file_size / 1024 / 1024).toFixed(1)) : null,
          caption: m.caption ?? null,
        },
      });
      await this.prisma.course.update({
        where: { id: course.id },
        data: { downloadCount: { increment: 0 } },
      });
      void upsert;
      return this.sendText(
        chatId,
        `✅ Linked “${course.title}”\n📦 ${doc.file_name ?? 'file'}${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}\n\nUsers can now get it with /download ${slug} or from the app.`,
      );
    } catch (err) {
      this.logger.error(`link failed: ${(err as Error).message}`);
      return this.sendText(chatId, 'Something went wrong while linking. Check the bot has access to the group.');
    }
  }

  private async unlinkCourse(chatId: number, slug: string) {
    if (!slug) return this.sendText(chatId, 'Usage: /unlink <course-slug>');
    const course = await this.prisma.course.findUnique({ where: { slug }, select: { id: true, title: true } });
    if (!course) return this.sendText(chatId, `Course “${slug}” not found.`);
    await this.prisma.telegramCourseLink.deleteMany({ where: { courseId: course.id } });
    return this.sendText(chatId, `Unlinked “${course.title}” — the Telegram file is no longer served.`);
  }

  /**
   * /newcourse Title | Instructor | Category | contentType | price | imageUrl
   * Creates a course that immediately appears on the site.
   */
  private async newCourse(chatId: number, arg: string) {
    const parts = arg.split('|').map((p) => p.trim());
    const [title, instructor, category, contentType, price, imageUrl] = parts;
    if (!title || !instructor) {
      return this.sendText(
        chatId,
        'Usage:\n/newcourse Course Title | Instructor Name | Category | course|mini-course|cheat-sheet|roadmap | price | image-url\n\nOnly Title and Instructor are required.',
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
      );
    } catch (err) {
      this.logger.error(`newCourse failed: ${(err as Error).message}`);
      return this.sendText(chatId, 'Could not create the course — check the format and try again.');
    }
  }

  private async broadcast(chatId: number, text: string) {
    if (!text) return this.sendText(chatId, 'Usage: /broadcast <message text>');
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
    return this.sendText(chatId, `Broadcast sent to ${sent}/${users.length} linked users.`);
  }

  // ---------------------------------------------------------------
  // User-facing download flow
  // ---------------------------------------------------------------

  /** Send the course file (or forward it) to a chat. */
  private async sendCourseFile(chatId: number, slug: string) {
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
        const res = await this.api('sendDocument', {
          chat_id: chatId,
          document: link.fileId,
          caption,
        });
        if (!(await res.json()).ok) throw new Error('sendDocument failed');
      } else {
        const res = await this.api('forwardMessage', {
          chat_id: chatId,
          from_chat_id: String(link.chatId),
          message_id: Number(link.fileMessageId),
        });
        if (!(await res.json()).ok) throw new Error('forwardMessage failed');
        await this.sendText(chatId, caption);
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
  private async sendLessonLink(chatId: number, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) return this.sendText(chatId, 'Lesson not found.');
    const appUrl = process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev';
    const text = `📚 Syncourse\n\n${lesson.course.title}\n${lesson.title}\n\n${appUrl}/courses/${lesson.course.slug}/lessons/${lesson.id}`;
    await this.sendText(chatId, text);
  }

  private async sendCourseList(chatId: number) {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true, ratingAvg: true } } },
      take: 50,
    });
    if (links.length === 0) {
      return this.sendText(chatId, 'No courses linked yet. Ask an admin to link files with /link.');
    }
    const rows = links
      .map(
        (l, i) =>
          `${i + 1}. ${l.course.title} — /download ${l.course.slug}${l.fileName ? ` (${l.fileName})` : ''}`,
      )
      .join('\n');
    await this.sendText(chatId, `📚 Courses with Telegram files:\n\n${rows}`);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private async sendText(chatId: number, text: string) {
    if (!this.enabled) return;
    try {
      await this.api('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (err) {
      this.logger.warn(`sendMessage failed: ${(err as Error).message}`);
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
    `👋 Welcome to <b>Syncourse</b>!\n\n` +
    `I send you course files straight to this chat.\n\n` +
    `• <b>Get a course</b>: send /courses to see what's available\n` +
    `• <b>Download one</b>: /download &lt;slug&gt;\n\n` +
    `Find the whole catalog at syncourse.pages.dev`
  );
}

function helpMessage(): string {
  return (
    `<b>Syncourse bot</b>\n\n` +
    `<b>For everyone:</b>\n` +
    `/courses — list courses with files\n` +
    `/download &lt;slug&gt; — get a course file\n\n` +
    `<b>For admins:</b>\n` +
    `/link &lt;slug&gt; &lt;t.me link&gt; — attach the file in a group topic to a course\n` +
    `/unlink &lt;slug&gt; — detach the file\n` +
    `/newcourse Title | Instructor | Category | type | price | image — create a course\n` +
    `/broadcast &lt;text&gt; — message all linked users\n\n` +
    `Example link: https://t.me/syncourse/2/41 (group → topic → message)`
  );
}
