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

/** Inline keyboard button — either a callback button or a URL button. */
interface KbButton {
  text: string;
  callback_data?: string;
  url?: string;
}

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'syncourse_bot';
const APP_URL = process.env.PUBLIC_APP_URL || 'https://syncourse.pages.dev';

// ---------------------------------------------------------------------------
// Premium design system — every bot message follows the same visual language:
//   • ━━ divider bars for section separation
//   • Bold brand header, emoji accents, <code> for slugs/commands
//   • <a> links to the web app, inline keyboards for one-tap actions
// ---------------------------------------------------------------------------
const DIV = '━━━━━━━━━━━━━━━━━━';

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
    // Persisted to Postgres so API restarts (Render free tier) don't lose it.
    const msgDoc = msg.document ?? msg.video ?? msg.audio;
    const fromId = msg.from?.id ?? chatId;
    if (msgDoc) {
      this.lastFileByUser.set(fromId, {
        messageId: msg.message_id,
        fileId: msgDoc.file_id,
        fileName: msgDoc.file_name ?? null,
        fileSize: msgDoc.file_size ?? null,
      });
      await this.prisma.telegramUserFile
        .upsert({
          where: { userId: BigInt(fromId) },
          create: {
            userId: BigInt(fromId),
            fileId: msgDoc.file_id,
            fileName: msgDoc.file_name ?? null,
            fileSizeMb: msgDoc.file_size ? Number((msgDoc.file_size / 1024 / 1024).toFixed(1)) : null,
          },
          update: {
            fileId: msgDoc.file_id,
            fileName: msgDoc.file_name ?? null,
            fileSizeMb: msgDoc.file_size ? Number((msgDoc.file_size / 1024 / 1024).toFixed(1)) : null,
          },
        })
        .catch((e) => this.logger.error(`persist user file failed: ${(e as Error).message}`));
      await this.logActivity(fromId, chatId, 'file', `${msgDoc.file_name ?? 'file'} (${(msgDoc.file_size ?? 0) / 1024 / 1024} MB) cached`);
    }

    if (!msg.text) return;
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
          await this.sendWelcome(chatId, threadId);
        }
        break;
      }
      case '/help':
        await this.sendHelp(chatId, threadId);
        break;
      case '/courses':
        await this.sendCourseList(chatId, threadId);
        break;
      case '/course':
        await this.sendCourseCard(chatId, arg, threadId);
        break;
      case '/search':
        await this.searchCourses(chatId, arg, threadId);
        break;
      case '/download': {
        // Accept a slug OR a title (case-insensitive):
        //   /download complete-machine-learning-and-data-science-2021
        //   /download Complete Machine Learning and Data Science 2021
        const slug = await this.resolveSlugByArg(arg);
        if (!slug) {
          await this.sendRich(
            chatId,
            `${this.brandHeader('Download')}\n\n` +
              `❌ Couldn't find a course matching <code>${esc(arg)}</code>.\n\n` +
              `Try <code>/search &lt;keyword&gt;</code> or see all with <code>/courses</code>.`,
            threadId,
          );
        } else {
          await this.sendCourseFile(chatId, slug, threadId);
        }
        break;
      }
      case '/link':
        await this.logActivity(fromId, chatId, 'command', `/link ${arg}`);
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
      case '/stats':
        if (await this.isAdmin(fromId)) await this.sendStats(chatId, threadId);
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
    } else if (data.startsWith('pg:')) {
      const page = Number(data.slice(3));
      if (!Number.isNaN(page)) await this.sendCourseList(chatId, undefined, page);
    } else if (data === 'noop') {
      /* the "Page X/Y" label is not clickable */
    } else if (data === 'courses') {
      await this.sendCourseList(chatId);
    } else if (data === 'help') {
      await this.sendHelp(chatId);
    } else if (data === 'home' || data === 'start') {
      await this.sendWelcome(chatId);
    } else if (data === 'stats') {
      await this.sendStats(chatId);
    } else if (data.startsWith('link:')) {
      const slug = data.slice(5);
      await this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `📎 Now attach the file for <code>${esc(slug)}</code>:\n\n` +
          `1️⃣ In the group, <b>REPLY to the ZIP message</b> with <code>/link ${esc(slug)}</code>\n` +
          `2️⃣ Or <b>forward the ZIP</b> to this bot, then send <code>/link ${esc(slug)}</code>\n\n` +
          `I'll confirm the moment it's linked ✅`,
      );
    }
  }

  // ---------------------------------------------------------------
  // Premium message templates
  // ---------------------------------------------------------------

  /** Brand header used at the top of most messages. */
  private brandHeader(title: string): string {
    return `${DIV}\n🎓 <b>SYNCOURSE</b> <i>· ${title}</i>\n${DIV}`;
  }

  private async sendWelcome(chatId: number, threadId?: number | null) {
    const [courseCount, linkedCount] = await Promise.all([
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.telegramCourseLink.count(),
    ]);
    const html =
      `${this.brandHeader('Premium Course Delivery')}\n\n` +
      `👋 <b>Welcome to Syncourse!</b>\n\n` +
      `Complete course files — <b>delivered straight to this chat</b>. No sign-ups, no ads, no waiting. Just tap and learn. 🚀\n\n` +
      `${DIV}\n` +
      `📚 <b>${courseCount}</b> courses in the catalog\n` +
      `📦 <b>${linkedCount}</b> files ready to download\n` +
      `⭐ Rated by thousands of learners\n` +
      `${DIV}\n\n` +
      `<b>How it works:</b>\n` +
      `1️⃣ Send <code>/courses</code> to browse everything available\n` +
      `2️⃣ Tap <b>📥 Download</b> on any course\n` +
      `3️⃣ The file arrives here instantly ⚡\n\n` +
      `🔗 <a href="${APP_URL}">Open the Syncourse web app →</a>`;
    await this.sendRich(chatId, html, threadId, [
      [{ text: '📚 Browse courses', callback_data: 'courses' }],
      [{ text: '❓ Help', callback_data: 'help' }, { text: '🌐 Web app', url: APP_URL }],
    ]);
  }

  private async sendHelp(chatId: number, threadId?: number | null, isAdmin = false) {
    const html =
      `${this.brandHeader('Command Center')}\n\n` +
      `<b>👤 For everyone</b>\n` +
      `${DIV}\n` +
      `<code>/start</code> — welcome & quick actions\n` +
      `<code>/courses</code> — browse courses with files 📚\n` +
      `<code>/search &lt;keyword&gt;</code> — find a course 🔍\n` +
      `<code>/course &lt;title&gt;</code> — course details card 🎴\n` +
      `<code>/download &lt;title&gt;</code> — get a course file ⚡\n\n` +
      `<i>💡 /course and /download accept the course <b>name</b> — no slug needed:</i>\n` +
      `<code>/download Complete Machine Learning</code>\n\n` +
      (isAdmin
        ? `<b>🛡️ Admin tools</b>\n${DIV}\n` +
          `<code>/link &lt;slug&gt;</code> — attach a file to a course (reply to the ZIP, or forward it first)\n` +
          `<code>/unlink &lt;slug&gt;</code> — detach the file\n` +
          `<code>/newcourse</code> — create a course: <i>Title | Instructor | Category | type | price | image</i>\n` +
          `<code>/broadcast &lt;text&gt;</code> — message all linked users 📢\n` +
          `<code>/stats</code> — platform dashboard 📊\n\n`
        : '') +
      `💡 Tip: on any course, tap <b>📥 Download</b> under its listing.\n` +
      `🔗 <a href="${APP_URL}">Explore the full catalog on the web →</a>`;
    await this.sendRich(chatId, html, threadId, [
      [{ text: '📚 Browse courses', callback_data: 'courses' }],
      [{ text: '🏠 Home', callback_data: 'home' }, { text: '🌐 Web app', url: APP_URL }],
    ]);
  }

  /** Page size for the /courses catalog. */
  private static readonly CATALOG_PAGE = 8;

  /**
   * /courses — paginated catalog of ALL courses. 8 per page with ◀️/▶️
   * navigation. Download buttons only appear for courses that have a linked
   * file; the rest show 📭 no file yet.
   */
  private async sendCourseList(chatId: number, threadId?: number | null, page = 0) {
    const total = await this.prisma.course.count({ where: { deletedAt: null } });
    if (total === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Catalog')}\n\n` +
          `📭 <b>No courses yet.</b>\n\n` +
          `The catalog is filling up — check back soon, or browse the web app in the meantime.`,
        threadId,
        [[{ text: '🌐 Web app', url: APP_URL }]],
      );
    }
    const pages = Math.ceil(total / TelegramService.CATALOG_PAGE);
    const safePage = Math.min(Math.max(page, 0), pages - 1);
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { title: 'asc' }],
      skip: safePage * TelegramService.CATALOG_PAGE,
      take: TelegramService.CATALOG_PAGE,
      select: { id: true, title: true, slug: true, ratingAvg: true, lecturer: { select: { name: true } } },
    });
    const links = await this.prisma.telegramCourseLink.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { courseId: true, fileName: true, fileSizeMb: true },
    });
    const linkByCourse = new Map(links.map((l) => [l.courseId, l]));
    const rows = courses
      .map((c, i) => {
        const l = linkByCourse.get(c.id);
        const startIdx = safePage * TelegramService.CATALOG_PAGE;
        return (
          `${startIdx + i + 1}. <b>${esc(c.title)}</b>\n` +
          `   🔑 <code>${esc(c.slug)}</code>\n` +
          (l
            ? `   📦 ${esc(l.fileName ?? 'file')}${l.fileSizeMb ? ` · ${l.fileSizeMb} MB` : ''} · ⭐ ${c.ratingAvg.toFixed(1)}`
            : `   📭 <i>no file yet</i> · ⭐ ${c.ratingAvg.toFixed(1)}`) +
          (c.lecturer ? ` · 👨‍🏫 ${esc(c.lecturer.name)}` : '')
        );
      })
      .join('\n\n');

    const kb: KbButton[][] = [];
    // Download buttons — only for courses that have a linked file
    for (const c of courses) {
      if (linkByCourse.has(c.id)) {
        kb.push([{ text: `📥 Download — ${c.slug.slice(0, 24)}`, callback_data: `dl:${c.slug}` }]);
      }
    }
    // Pagination row: ◀️ Prev · Page X/Y · Next ▶️
    const navRow: KbButton[] = [];
    if (safePage > 0) navRow.push({ text: '◀️ Prev', callback_data: `pg:${safePage - 1}` });
    navRow.push({ text: `📄 ${safePage + 1}/${pages}`, callback_data: 'noop' });
    if (safePage < pages - 1) navRow.push({ text: 'Next ▶️', callback_data: `pg:${safePage + 1}` });
    kb.push(navRow);
    kb.push([
      { text: '🏠 Home', callback_data: 'home' },
      { text: '❓ Help', callback_data: 'help' },
      { text: '🌐 Web app', url: APP_URL },
    ]);

    await this.sendRich(
      chatId,
      `${this.brandHeader('Course Catalog')}\n\n${rows}\n\n${DIV}\n` +
        `<i>${total} courses · page ${safePage + 1}/${pages}</i>` +
        `\n<i>📥 buttons appear for courses with files ready — tap to download instantly</i>`,
      threadId,
      kb,
    );
  }

  /** /course <title-or-slug> — premium course details card with one-tap actions. */
  private async sendCourseCard(chatId: number, arg: string, threadId?: number | null) {
    if (!arg) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Course Card')}\n\n` +
          `Usage: <code>/course &lt;title or slug&gt;</code>\n\n` +
          `Example: <code>/course Complete Machine Learning</code>\n` +
          `Or browse with <code>/courses</code>.`,
        threadId,
      );
    }
    const course = await this.resolveCourseByArg(arg);
    if (!course) {
      const suggestions = await this.titleSuggestions(arg);
      return this.sendRich(
        chatId,
          `${this.brandHeader('Course Card')}\n\n` +
          `❌ No course matches <code>${esc(arg)}</code>.\n\n` +
          (suggestions.length
            ? `Did you mean:\n${suggestions}\n\n`
            : '') +
          `Try <code>/search &lt;keyword&gt;</code> or <code>/courses</code>.`,
        threadId,
      );
    }
    const link = await this.prisma.telegramCourseLink.findUnique({
      where: { courseId: course.id },
    });
    const catNames = course.categories.map((cc) => esc(cc.category.name)).join(', ') || '—';
    const price =
      course.price != null
        ? `💵 <b>$${course.price}</b>${course.originalPrice && course.originalPrice > course.price ? ` <s>$${course.originalPrice}</s>` : ''}`
        : '💵 <b>Free</b>';
    const typeMap: Record<string, string> = { course: '📘 Course', 'mini-course': '📗 Mini-course', 'cheat-sheet': '📋 Cheat-sheet', roadmap: '🗺️ Roadmap' };
    const type = typeMap[course.contentType] ?? '📘 Course';
    const html =
      `${this.brandHeader('Course Details')}\n\n` +
      `🎴 <b>${esc(course.title)}</b>\n` +
      `${DIV}\n` +
      `${type} · ${course.level ? esc(course.level.name) : 'All levels'}\n` +
      `👨‍🏫 ${course.lecturer ? esc(course.lecturer.name) : '—'}\n` +
      `🏷️ ${catNames}\n` +
      `⭐ <b>${course.ratingAvg.toFixed(1)}</b> / 5 · ${course._count.lessons} lessons\n` +
      `${price}\n` +
      (link ? `📦 <b>File ready:</b> ${esc(link.fileName ?? 'linked')}${link.fileSizeMb ? ` · ${link.fileSizeMb} MB` : ''}` : `📦 <i>File coming soon</i>`) +
      `\n${DIV}\n` +
      (course.description ? `${esc(course.description.slice(0, 220))}\n\n` : '') +
      `🔗 <a href="${APP_URL}/courses/${course.slug}">View on the web →</a>`;
    const kb: KbButton[][] = [];
    if (link) kb.push([{ text: '📥 Download now', callback_data: `dl:${course.slug}` }]);
    kb.push([
      { text: '📚 All courses', callback_data: 'courses' },
      { text: '🏠 Home', callback_data: 'home' },
    ]);
    await this.sendRich(chatId, html, threadId, kb);
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
      return this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `<b>Easiest way:</b> in the group, <b>REPLY to the ZIP message</b> with:\n` +
          `<code>/link &lt;course-slug&gt;</code>\n\n` +
          `<b>Or in the DM:</b>\n` +
          `<code>/link &lt;course-slug&gt; &lt;t.me/group/TOPIC/MESSAGE&gt;</code>\n\n` +
          `Pick a real slug from this list:\n\n${await this.courseSlugList()}`,
        threadId,
      );
    }
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, slug: true, deletedAt: true },
    });
    if (!course || course.deletedAt) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `❌ Course <code>${esc(slug)}</code> not found.\n\n` +
          `Choose a real slug:\n\n${await this.courseSlugList()}`,
        threadId,
      );
    }

    // Mode 1: a file to attach — from a reply, or the last file this user
    // forwarded to the bot (persisted in Postgres, so it survives restarts).
    const reply = msg?.reply_to_message;
    const replyDoc = reply ? (reply.document ?? reply.video ?? reply.audio) : undefined;
    const cachedMem = fromId ? this.lastFileByUser.get(fromId) : undefined;
    const cachedDb = fromId
      ? await this.prisma.telegramUserFile
          .findUnique({ where: { userId: BigInt(fromId) } })
          .catch(() => null)
      : null;
    const cached = cachedMem ?? (cachedDb ? { fileId: cachedDb.fileId, fileName: cachedDb.fileName, fileSize: cachedDb.fileSizeMb ? cachedDb.fileSizeMb * 1024 * 1024 : null } : undefined);
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
      await this.logActivity(fromId ?? null, chatId, 'link', `✅ linked ${course.slug} -> ${doc.file_name ?? 'file'}`);
      const kb: KbButton[][] = [
        [{ text: '📥 Test download', callback_data: `dl:${course.slug}` }],
        [{ text: '📚 Catalog', callback_data: 'courses' }, { text: '📊 Stats', callback_data: 'stats' }],
      ];
      return this.sendRich(
        chatId,
        `${this.brandHeader('File Linked')}\n\n` +
          `✅ <b>“${esc(course.title)}”</b> is now linked to ${sourceName}.\n\n` +
          `📦 <b>${esc(doc.file_name ?? 'file')}</b>${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}\n` +
          `🔑 <code>/download ${course.slug}</code>\n\n` +
          `Users can grab it instantly from the bot or the <a href="${APP_URL}/courses/${course.slug}">app</a>.`,
        threadId,
        kb,
      );
    }
    if (reply) {
      return this.sendText(chatId, 'The message you replied to does not contain a file (ZIP/video/audio). Reply to the file message itself.', threadId);
    }

    // Mode 2: no file cached yet — guide the admin clearly.
    const url = arg.split(/\s+/)[1] ?? '';
    if (!url) {
      await this.logActivity(fromId ?? null, chatId, 'link', `no file for ${slug} — guided admin`);
      return this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `📭 I don't have a file for <code>${esc(slug)}</code> yet. Two easy ways:\n\n` +
          `1️⃣ <b>Forward the course ZIP</b> to this bot (any chat), then send <code>/link ${slug}</code> again\n` +
          `2️⃣ <b>Reply to the ZIP message</b> in the group with <code>/link ${slug}</code>\n\n` +
          `Example: forward the ZIP → then send <code>/link ${slug}</code>`,
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
      return this.sendRich(
        chatId,
        `${this.brandHeader('File Linked')}\n\n` +
          `✅ <b>“${esc(course.title)}”</b> is now linked.\n` +
          `📦 <b>${esc(doc.file_name ?? 'file')}</b>${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}\n` +
          `🔑 <code>/download ${course.slug}</code>\n\n` +
          `Users can grab it from the bot or the <a href="${APP_URL}/courses/${course.slug}">app</a>.`,
        threadId,
        [[{ text: '📥 Test download', callback_data: `dl:${course.slug}` }]],
      );
    } catch (err) {
      this.logger.error(`link failed: ${(err as Error).message}`);
      return this.sendText(chatId, 'Something went wrong while linking. Check the bot has access to the group.', threadId);
    }
  }

  private async unlinkCourse(chatId: number, slug: string, threadId?: number | null) {
    if (!slug) return this.sendText(chatId, 'Usage: /unlink <course-slug>', threadId);
    const course = await this.prisma.course.findUnique({ where: { slug }, select: { id: true, title: true } });
    if (!course) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Unlink')}\n\n❌ Course <code>${esc(slug)}</code> not found.`,
        threadId,
      );
    }
    await this.prisma.telegramCourseLink.deleteMany({ where: { courseId: course.id } });
    await this.logActivity(null, chatId, 'link', `unlinked ${slug}`);
    return this.sendRich(
      chatId,
      `${this.brandHeader('Unlinked')}\n\n` +
        `🗑️ <b>“${esc(course.title)}”</b> — the Telegram file is no longer served.\n` +
        `Re-link anytime with <code>/link ${slug}</code>.`,
      threadId,
    );
  }

  /**
   * /newcourse Title | Instructor | Category | contentType | price | imageUrl
   * Creates a course that immediately appears on the site.
   */
  private async newCourse(chatId: number, arg: string, threadId?: number | null) {
    const parts = arg.split('|').map((p) => p.trim());
    const [title, instructor, category, contentType, price, imageUrl] = parts;
    if (!title || !instructor) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('New Course')}\n\n` +
          `<b>Usage:</b>\n<code>/newcourse Title | Instructor | Category | type | price | image-url</code>\n\n` +
          `<b>Example:</b>\n<code>/newcourse Complete ML | Andrei Neagoie | Data Science | course | 64.99 | https://…/cover.jpg</code>\n\n` +
          `<i>Only Title and Instructor are required. Type: course | mini-course | cheat-sheet | roadmap</i>`,
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
      await this.logActivity(null, chatId, 'course', `created ${slug}`);
      return this.sendRich(
        chatId,
        `${this.brandHeader('Course Created')}\n\n` +
          `✅ <b>“${esc(course.title)}”</b> is live on the site!\n\n` +
          `👨‍🏫 ${esc(instructor)}${category ? ` · 🏷️ ${esc(category)}` : ''}${price ? ` · 💵 $${price}` : ''}\n` +
          `🔗 <a href="${APP_URL}/courses/${course.slug}">Open the course →</a>\n\n` +
          `<b>Next:</b> attach the file — reply to the ZIP with:\n<code>/link ${course.slug}</code>`,
        threadId,
        [[{ text: '🔗 Link a file', callback_data: `link:${course.slug}` }], [{ text: '📊 Stats', callback_data: 'stats' }]],
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
    const html =
      `${this.brandHeader('Announcement')}\n\n` +
      `${esc(text)}\n\n` +
      `${DIV}\n` +
      `🎓 <b>Syncourse</b> · <a href="${APP_URL}">Open the app →</a>`;
    let sent = 0;
    for (const u of users) {
      try {
        const res = await this.api('sendMessage', {
          chat_id: String(u.telegramId),
          text: html,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        if ((await res.json()).ok) sent++;
      } catch {
        /* skip */
      }
    }
    await this.logActivity(null, chatId, 'broadcast', `sent ${sent}/${users.length}`);
    return this.sendRich(
      chatId,
      `${this.brandHeader('Broadcast')}\n\n` +
        `📢 Sent to <b>${sent}/${users.length}</b> linked users.\n\n` +
        `${esc(text.slice(0, 120))}${text.length > 120 ? '…' : ''}`,
      threadId,
    );
  }

  /** /stats — admin platform dashboard. */
  private async sendStats(chatId: number, threadId?: number | null) {
    const [courses, users, links, downloads, lessons, reviews] = await Promise.all([
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.user.count(),
      this.prisma.telegramCourseLink.count(),
      this.prisma.downloadEvent.count(),
      this.prisma.lesson.count(),
      this.prisma.review.count(),
    ]);
    const recentLinks = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const recent = recentLinks.length
      ? recentLinks.map((l) => `• <b>${esc(l.course.title)}</b> — <code>/download ${l.course.slug}</code>`).join('\n')
      : '• <i>No files linked yet.</i>';
    const html =
      `${this.brandHeader('Platform Dashboard')}\n\n` +
      `📚 <b>${courses}</b> courses\n` +
      `👥 <b>${users}</b> users\n` +
      `📦 <b>${links}</b> files linked\n` +
      `⬇️ <b>${downloads}</b> bot downloads\n` +
      `🎬 <b>${lessons}</b> lessons\n` +
      `⭐ <b>${reviews}</b> reviews\n` +
      `${DIV}\n` +
      `<b>Recently linked:</b>\n${recent}\n` +
      `${DIV}\n` +
      `🔗 <a href="${APP_URL}/admin">Open the admin console →</a>`;
    await this.sendRich(chatId, html, threadId, [
      [{ text: '📚 Catalog', callback_data: 'courses' }, { text: '🏠 Home', callback_data: 'home' }],
    ]);
  }

  // ---------------------------------------------------------------
  // User-facing download flow
  // ---------------------------------------------------------------

  /** Send the course file (or forward it) to a chat — premium caption + actions. */
  private async sendCourseFile(chatId: number, slug: string, threadId?: number | null) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        ratingAvg: true,
        price: true,
        lecturer: { select: { name: true } },
      },
    });
    if (!course) return this.sendText(chatId, `Course “${slug}” not found. Try /courses.`);
    const link = await this.prisma.telegramCourseLink.findUnique({
      where: { courseId: course.id },
    });
    if (!link) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Download')}\n\n` +
          `📭 <b>“${esc(course.title)}”</b> has no Telegram file linked yet.\n` +
          `Try again later — the team adds files daily.`,
        threadId,
        [[{ text: '📚 All courses', callback_data: 'courses' }]],
      );
    }
    const caption =
      `🎓 <b>${esc(course.title)}</b>\n` +
      `${DIV}\n` +
      `⭐ <b>${course.ratingAvg.toFixed(1)}</b> / 5${course.lecturer ? ` · 👨‍🏫 ${esc(course.lecturer.name)}` : ''}\n` +
      (link.fileSizeMb ? `📦 ${esc(link.fileName ?? 'file')} · ${link.fileSizeMb} MB\n` : '') +
      `${DIV}\n` +
      `Happy learning! 🚀 More at <a href="${APP_URL}/courses/${course.slug}">syncourse.pages.dev</a>`;
    try {
      if (link.fileId) {
        const body: Record<string, unknown> = {
          chat_id: chatId,
          document: link.fileId,
          caption,
          parse_mode: 'HTML',
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
      // Follow-up card after the file lands
      await this.sendRich(
        chatId,
        `${this.brandHeader('Enjoy!')}\n\n` +
          `✅ File delivered — <b>“${esc(course.title)}”</b> is all yours.\n` +
          `Want more? Browse the full catalog below. 👇`,
        threadId,
        [
          [{ text: '📚 All courses', callback_data: 'courses' }],
          [{ text: '🏠 Home', callback_data: 'home' }, { text: '❓ Help', callback_data: 'help' }],
        ],
      );
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
    const text = `📚 Syncourse\n\n${lesson.course.title}\n${lesson.title}\n\n${APP_URL}/courses/${lesson.course.slug}/lessons/${lesson.id}`;
    await this.sendText(chatId, text, threadId);
  }

  /**
   * Resolve a course from a user-friendly query: exact slug → exact title →
   * title contains (case-insensitive). Lets users type the course name.
   */
  private async resolveCourseByArg(arg: string) {
    const select = {
      id: true,
      title: true,
      slug: true,
      description: true,
      ratingAvg: true,
      price: true,
      originalPrice: true,
      contentType: true,
      thumbnailUrl: true,
      lecturer: { select: { name: true } },
      level: { select: { name: true } },
      categories: { include: { category: { select: { name: true } } } },
      _count: { select: { lessons: true } },
    } as const;
    const firstToken = arg.split(/\s+/)[0] ?? '';
    // 1) exact slug
    const bySlug = await this.prisma.course.findUnique({ where: { slug: firstToken }, select });
    if (bySlug) return bySlug;
    // 2) exact title (case-insensitive)
    const byTitle = await this.prisma.course.findFirst({
      where: { deletedAt: null, title: { equals: arg, mode: 'insensitive' } },
      select,
    });
    if (byTitle) return byTitle;
    // 3) title contains (case-insensitive)
    const byContains = await this.prisma.course.findFirst({
      where: { deletedAt: null, title: { contains: arg, mode: 'insensitive' } },
      select,
    });
    if (byContains) return byContains;
    // 4) tolerate trailing junk like "(file name)" — match on the first token
    const byFirstToken = await this.prisma.course.findFirst({
      where: { deletedAt: null, title: { contains: firstToken, mode: 'insensitive' } },
      select,
    });
    return byFirstToken ?? null;
  }

  /** Resolve just the slug from a title-or-slug query (for /download). */
  private async resolveSlugByArg(arg: string): Promise<string | null> {
    const course = await this.resolveCourseByArg(arg);
    return course?.slug ?? null;
  }

  /** Up to 5 matching course titles + slugs, for "did you mean" suggestions. */
  private async titleSuggestions(arg: string): Promise<string> {
    const firstToken = arg.split(/\s+/)[0] ?? '';
    if (!firstToken) return '';
    const matches = await this.prisma.course.findMany({
      where: { deletedAt: null, title: { contains: firstToken, mode: 'insensitive' } },
      select: { title: true, slug: true },
      take: 5,
    });
    return matches.map((m) => `• <code>${esc(m.slug)}</code> — ${esc(m.title)}`).join('\n');
  }

  /** /search <keyword> — find courses by title keyword across the catalog. */
  private async searchCourses(chatId: number, arg: string, threadId?: number | null) {
    if (!arg) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Search')}\n\n` +
          `Usage: <code>/search &lt;keyword&gt;</code>\n\n` +
          `Example: <code>/search machine learning</code>`,
        threadId,
      );
    }
    const words = arg.split(/\s+/).filter(Boolean);
    const matches = await this.prisma.course.findMany({
      where: {
        deletedAt: null,
        AND: words.map((w) => ({ title: { contains: w, mode: 'insensitive' } })),
      },
      select: { id: true, title: true, slug: true, ratingAvg: true, lecturer: { select: { name: true } } },
      take: 10,
    });
    if (matches.length === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Search')}\n\n` +
          `🔍 No results for <code>${esc(arg)}</code>.\n\n` +
          `Try fewer words, or browse <code>/courses</code>.`,
        threadId,
      );
    }
    const links = await this.prisma.telegramCourseLink.findMany({
      where: { courseId: { in: matches.map((m) => m.id) } },
      select: { courseId: true, fileName: true, fileSizeMb: true },
    });
    const linkByCourse = new Map(links.map((l) => [l.courseId, l]));
    const rows = matches
      .map((c, i) => {
        const l = linkByCourse.get(c.id);
        return (
          `${i + 1}. <b>${esc(c.title)}</b>\n` +
          `   🔑 <code>${esc(c.slug)}</code>${l ? ` · 📦 ${esc(l.fileName ?? 'file')}${l.fileSizeMb ? ` · ${l.fileSizeMb} MB` : ''}` : ' · 📭 no file yet'}` +
          (c.lecturer ? ` · 👨‍🏫 ${esc(c.lecturer.name)}` : '') +
          ` · ⭐ ${c.ratingAvg.toFixed(1)}`
        );
      })
      .join('\n\n');
    const kb: KbButton[][] = matches
      .filter((m) => linkByCourse.has(m.id))
      .map((m) => [{ text: `📥 Download — ${m.slug.slice(0, 24)}`, callback_data: `dl:${m.slug}` }]);
    kb.push([
      { text: '🏠 Home', callback_data: 'home' },
      { text: '❓ Help', callback_data: 'help' },
    ]);
    await this.sendRich(
      chatId,
      `${this.brandHeader('Search Results')}\n\n${rows}\n\n${DIV}\n<i>🔍 Results for “${esc(arg)}”</i>`,
      threadId,
      kb,
    );
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
    return courses.map((c) => `• <code>${esc(c.slug)}</code>`).join('\n') + '\n';
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

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  /** Persist a bot event so /telegram/status can show what happened. */
  private async logActivity(userId: number | null, chatId: number, kind: string, detail: string) {
    try {
      await this.prisma.telegramActivity.create({
        data: {
          userId: userId ? BigInt(userId) : null,
          chatId: BigInt(chatId),
          kind,
          detail: detail.slice(0, 400),
        },
      });
      // keep the table small
      await this.prisma.telegramActivity
        .deleteMany({ where: { at: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } })
        .catch(() => undefined);
    } catch {
      /* never break the bot because logging failed */
    }
  }

  /**
   * Premium rich-text sender: parse_mode HTML + optional inline keyboard.
   * All dynamic content MUST be passed through esc() before reaching here —
   * raw <angle brackets> in user data would otherwise break the message.
   */
  private async sendRich(
    chatId: number,
    html: string,
    threadId?: number | null,
    keyboard?: KbButton[][],
  ) {
    if (!this.enabled) return;
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (threadId) body.message_thread_id = threadId;
      if (keyboard && keyboard.length) {
        body.reply_markup = { inline_keyboard: keyboard };
      }
      const res = await this.api('sendMessage', body);
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) {
        this.logger.error(`sendRich rejected (${chatId}): ${json.description} — text: ${html.slice(0, 200)}`);
        // Fall back to plain text so the user always gets an answer
        const plain = html
          .replace(/<b>(.*?)<\/b>/g, '$1')
          .replace(/<i>(.*?)<\/i>/g, '$1')
          .replace(/<s>(.*?)<\/s>/g, '$1')
          .replace(/<code>(.*?)<\/code>/g, '$1')
          .replace(/<a href="[^"]*">(.*?)<\/a>/g, '$1');
        await this.sendText(chatId, plain, threadId);
      }
    } catch (err) {
      this.logger.error(`sendRich failed: ${(err as Error).message}`);
    }
  }

  private async sendText(chatId: number, text: string, threadId?: number | null) {
    if (!this.enabled) return;
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
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

  /** Bot status + linked courses + recent activity — /telegram/status endpoint. */
  async status() {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true } } },
    });
    const activity = await this.prisma.telegramActivity
      .findMany({ orderBy: { at: 'desc' }, take: 15 })
      .catch(() => []);
    const filesCached = await this.prisma.telegramUserFile.count().catch(() => 0);
    return {
      enabled: this.enabled,
      polling: this.polling,
      botUsername: `@${BOT_USERNAME}`,
      lastPollAt: this.lastPollAt ? this.lastPollAt.toISOString() : null,
      lastUpdateAt: this.lastUpdateAt ? this.lastUpdateAt.toISOString() : null,
      pollErrors: this.pollErrors,
      lastError: this.lastError,
      filesCached,
      linkedCourses: links.map((l) => ({
        slug: l.course.slug,
        title: l.course.title,
        fileName: l.fileName,
        chatUsername: l.chatUsername,
      })),
      recentActivity: activity.map((a) => ({
        at: a.at.toISOString(),
        kind: a.kind,
        userId: a.userId ? a.userId.toString() : null,
        chatId: a.chatId ? a.chatId.toString() : null,
        detail: a.detail,
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

/** Escape user/course-provided text for safe use inside HTML parse_mode messages. */
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
