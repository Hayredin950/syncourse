import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

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
    photo?: { file_id: string }[];
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

/** Interactive wizard state, keyed by Telegram user id — persisted to Postgres
 *  so a Render restart/redeploy mid-flow never loses the user's progress. */
interface CourseWizard {
  kind: 'course' | 'search' | 'download' | 'broadcast' | 'coursefind' | 'edit';
  step:
    | 'title'
    | 'instructor'
    | 'category'
    | 'level'
    | 'type'
    | 'price'
    | 'image'
    | 'confirm'
    | 'keyword'
    | 'pick'
    | 'text'
    | 'name'
    | 'field'
    | 'value';
  data: {
    title?: string;
    instructor?: string;
    categoryId?: string;
    levelName?: string;
    contentType?: string;
    price?: number | null;
    imageUrl?: string | null;
    imageIsTelegram?: boolean; // imageUrl is a Telegram file_id, not an http URL
    keyword?: string;
    /** /edit wizard — the course being edited */
    editCourseId?: string;
    editCourseSlug?: string;
    /** /edit wizard — which of the 7 fields is being edited */
    editField?: 'title' | 'instructor' | 'category' | 'level' | 'type' | 'price' | 'image';
  };
  /** the bot's wizard bubble — edited in place on every step (Argo-style) */
  messageId?: number;
  expiresAt: number;
}

const WIZARD_TTL_MS = 30 * 60 * 1000; // wizard expires after 30 min

/** One entry in the user's navigation history (browser-style back/forward). */
interface NavEntry {
  key: 'home' | 'courses' | 'courselist' | 'help' | 'stats' | 'course' | 'search';
  arg?: string; // course slug / search keyword
  page?: number; // catalog page for 'courses'
}

/** Per-user nav stack, keyed by Telegram user id. */
interface NavState {
  history: NavEntry[];
  index: number;
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

  /** Per-user cache of the most recent PHOTO the user sent — used to set a
   *  course cover/banner directly from an image instead of a URL. */
  private lastPhotoByUser = new Map<number, { fileId: string; updatedAt: number }>();

  /** Message ids of bot bubbles that are PHOTOS (course cards with a cover).
   *  A photo message can't be editMessageText'd into another view, so when a
   *  button on a photo bubble is tapped we delete it and send the target as a
   *  fresh message instead (Argo-style replace, no dead bubbles). */
  private photoBubbles = new Map<number, Set<number>>();

  private async deleteMessage(chatId: number, messageId: number) {
    try {
      await this.api('deleteMessage', { chat_id: chatId, message_id: messageId });
    } catch {
      /* ignore */
    }
  }

  /** Active wizards, keyed by Telegram user id (memory cache over Postgres). */
  private courseWizards = new Map<number, CourseWizard>();

  /** Per-user nav stacks (memory cache over Postgres). */
  private navStates = new Map<number, NavState>();

  private async loadNav(userId: number): Promise<NavState | null> {
    const mem = this.navStates.get(userId);
    if (mem) return mem;
    const row = await this.prisma.telegramNav
      .findUnique({ where: { userId: BigInt(userId) } })
      .catch(() => null);
    if (!row) return null;
    const state: NavState = {
      history: (row.history as unknown as NavEntry[]) ?? [],
      index: row.index ?? 0,
    };
    this.navStates.set(userId, state);
    return state;
  }

  private async saveNav(userId: number, state: NavState) {
    this.navStates.set(userId, state);
    await this.prisma.telegramNav
      .upsert({
        where: { userId: BigInt(userId) },
        create: { userId: BigInt(userId), history: (state.history as unknown) as object, index: state.index },
        update: { history: (state.history as unknown) as object, index: state.index },
      })
      .catch((e) => this.logger.error(`saveNav failed: ${(e as Error).message}`));
  }

  /** Push a new view onto the stack (truncating any forward history). */
  private async pushNav(userId: number, entry: NavEntry) {
    const state = (await this.loadNav(userId)) ?? { history: [], index: -1 };
    state.history = state.history.slice(0, state.index + 1);
    state.history.push(entry);
    state.index = state.history.length - 1;
    await this.saveNav(userId, state);
  }

  /**
   * Browser-style back/forward row for a given user. ◀️ Back appears when
   * history exists behind, ▶️ Forward appears when there's history ahead
   * (i.e. after the user went back). Both edit the tapped message in place.
   */
  private async navRowFor(userId: number): Promise<KbButton[]> {
    const state = await this.loadNav(userId);
    if (!state || state.history.length === 0) return [];
    const row: KbButton[] = [];
    if (state.index > 0) row.push({ text: '◀️ Back', callback_data: 'nav:back' });
    if (state.index < state.history.length - 1) row.push({ text: 'Forward ▶️', callback_data: 'nav:fwd' });
    return row;
  }

  /** Go back one view — re-render the previous entry into the tapped message. */
  private async navBack(chatId: number, userId: number, messageId?: number) {
    const state = await this.loadNav(userId);
    if (!state || state.index <= 0) return;
    state.index--;
    await this.saveNav(userId, state);
    const entry = state.history[state.index];
    if (entry) await this.renderNavEntry(chatId, userId, entry, messageId);
  }

  /** Go forward one view (redo) — re-render the next entry into the message. */
  private async navFwd(chatId: number, userId: number, messageId?: number) {
    const state = await this.loadNav(userId);
    if (!state || state.index >= state.history.length - 1) return;
    state.index++;
    await this.saveNav(userId, state);
    const entry = state.history[state.index];
    if (entry) await this.renderNavEntry(chatId, userId, entry, messageId);
  }

  /** Re-render a nav entry (used by back/forward). */
  private async renderNavEntry(chatId: number, userId: number, entry: NavEntry, messageId?: number) {
    switch (entry.key) {
      case 'home':
        await this.sendWelcome(chatId, undefined, messageId, userId);
        break;
      case 'courses':
        await this.sendCourseList(chatId, undefined, entry.page ?? 0, messageId, userId);
        break;
      case 'courselist':
        await this.sendCoursePicker(chatId, undefined, entry.page ?? 0, messageId, userId);
        break;
      case 'help':
        await this.sendHelp(chatId, undefined, false, messageId, userId);
        break;
      case 'stats':
        await this.sendStats(chatId, undefined, messageId, userId);
        break;
      case 'course':
        await this.sendCourseCard(chatId, entry.arg ?? '', undefined, messageId, userId);
        break;
      case 'search':
        await this.searchCourses(chatId, entry.arg ?? '', undefined, messageId, userId);
        break;
    }
  }

  private async loadWizard(userId: number): Promise<CourseWizard | null> {
    const mem = this.courseWizards.get(userId);
    if (mem) return mem;
    const row = await this.prisma.telegramWizard
      .findUnique({ where: { userId: BigInt(userId) } })
      .catch(() => null);
    if (!row) return null;
    const wizard: CourseWizard = {
      kind: row.kind as CourseWizard['kind'],
      step: row.step as CourseWizard['step'],
      data: (row.data as Record<string, unknown>) ?? {},
      messageId: row.messageId ? Number(row.messageId) : undefined,
      expiresAt: row.expiresAt.getTime(),
    };
    if (wizard.expiresAt < Date.now()) {
      await this.clearWizard(userId);
      return null;
    }
    this.courseWizards.set(userId, wizard);
    return wizard;
  }

  private async saveWizard(userId: number, wizard: CourseWizard) {
    this.courseWizards.set(userId, wizard);
    await this.prisma.telegramWizard
      .upsert({
        where: { userId: BigInt(userId) },
        create: {
          userId: BigInt(userId),
          kind: wizard.kind,
          step: wizard.step,
          data: (wizard.data as unknown) as object,
          messageId: wizard.messageId ? BigInt(wizard.messageId) : null,
          expiresAt: new Date(wizard.expiresAt),
        },
        update: {
          kind: wizard.kind,
          step: wizard.step,
          data: (wizard.data as unknown) as object,
          messageId: wizard.messageId ? BigInt(wizard.messageId) : null,
          expiresAt: new Date(wizard.expiresAt),
        },
      })
      .catch((e) => this.logger.error(`saveWizard failed: ${(e as Error).message}`));
  }

  private async clearWizard(userId: number) {
    this.courseWizards.delete(userId);
    await this.prisma.telegramWizard
      .deleteMany({ where: { userId: BigInt(userId) } })
      .catch(() => undefined);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

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
    // remember the most recent photo — used by the wizard to set a cover
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : undefined;
    if (photo) {
      this.lastPhotoByUser.set(fromId, { fileId: photo.file_id, updatedAt: Date.now() });
    }
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

    // If an interactive wizard is in progress, plain text feeds it — unless
    // the user explicitly sends /cancel (handled below). Loaded from Postgres
    // so a deploy mid-flow doesn't lose the wizard.
    const wizard = await this.loadWizard(fromId);
    // A photo at the cover-image step sets the banner directly (no URL needed).
    // NOTE: this MUST run before the `if (!msg.text) return;` below — photos
    // carry no text, so the early return would silently drop them.
    if (wizard && photo && !msg.text) {
      // the user's input photo is consumed by the wizard — remove it so the
      // chat stays clean (single morphing bubble, no pile-up)
      if (msg.chat.type === 'private') await this.deleteMessage(chatId, msg.message_id);
      if (wizard.kind === 'course' && wizard.step === 'image') {
        wizard.data.imageUrl = photo.file_id;
        wizard.data.imageIsTelegram = true;
        wizard.step = 'confirm';
        await this.saveWizard(fromId, wizard);
        await this.showWizardConfirm(chatId, fromId, threadId);
        return;
      }
      if (wizard.kind === 'edit' && wizard.step === 'value' && wizard.data.editField === 'image') {
        await this.applyEditField(chatId, fromId, threadId, wizard, { imageTelegramFileId: photo.file_id });
        return;
      }
    }

    if (!msg.text) return;
    const text = msg.text.trim();
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    if (wizard && !text.startsWith('/') && !command.startsWith('wz:')) {
      // the answer feeds the wizard — remove the user's input message too
      if (msg.chat.type === 'private') await this.deleteMessage(chatId, msg.message_id);
      await this.handleWizardText(chatId, fromId, text, threadId, wizard);
      return;
    }

    switch (command) {
      case '/start': {
        const payload = arg.replace(/^@\w+\s*/, '');
        if (payload.startsWith('dl_')) {
          await this.sendCourseFile(chatId, payload.slice(3), threadId);
        } else if (payload.startsWith('download_')) {
          await this.sendLessonLink(chatId, payload.slice(9));
        } else {
          await this.pushNav(fromId, { key: 'home' });
          await this.sendWelcome(chatId, threadId, undefined, fromId);
        }
        break;
      }
      case '/help':
        await this.pushNav(fromId, { key: 'help' });
        await this.sendHelp(chatId, threadId, undefined, undefined, fromId);
        break;
      case '/courselist':
        // picker: tap a course button to see its details card
        await this.pushNav(fromId, { key: 'courselist', page: 0 });
        await this.sendCoursePicker(chatId, threadId, 0, undefined, fromId);
        break;
      case '/courses':
        // catalog: paginated list, titles deep-link straight to download
        await this.pushNav(fromId, { key: 'courses', page: 0 });
        await this.sendCourseList(chatId, threadId, 0, undefined, fromId);
        break;
      case '/course-detail':
      case '/course': // alias kept for backward compatibility
        if (arg) {
          await this.pushNav(fromId, { key: 'course', arg });
          await this.sendCourseCard(chatId, arg, threadId, undefined, fromId);
        } else {
          // interactive: prompt for a name/slug and find a match
          await this.startCourseLookup(chatId, fromId, threadId);
        }
        break;
      case '/edit':
        if (await this.isAdmin(fromId)) {
          if (arg) {
            const tokens = arg.split(/\s+/);
            const fieldToken = (tokens[1] ?? '').toLowerCase().replace(/^--/, '');
            const EDIT_FIELDS = ['title', 'instructor', 'category', 'level', 'type', 'price', 'image', 'cover'];
            if (tokens.length >= 3 && EDIT_FIELDS.includes(fieldToken)) {
              // one-line: /edit <title> <field> <value>
              const field = fieldToken === 'cover' ? 'image' : fieldToken;
              await this.editCourseOneLine(chatId, fromId, tokens[0], field, tokens.slice(2).join(' ').trim(), threadId);
            } else {
              await this.startEditWizard(chatId, fromId, arg, threadId);
            }
          } else {
            await this.pickerFor(chatId, fromId, 'edit', 0, undefined, threadId);
          }
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      case '/search':
        if (arg) {
          await this.pushNav(fromId, { key: 'search', arg });
          await this.searchCourses(chatId, arg, threadId, undefined, fromId);
        } else {
          // interactive: ask for a keyword
          await this.startSearchWizard(chatId, fromId, threadId);
        }
        break;
      case '/download': {
        // Accept a slug OR a title (case-insensitive):
        //   /download complete-machine-learning-and-data-science-2021
        //   /download Complete Machine Learning and Data Science 2021
        if (!arg) {
          // interactive: ask which course
          await this.startDownloadWizard(chatId, fromId, threadId);
          break;
        }
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
        if (await this.isAdmin(fromId)) {
          if (arg) await this.linkCourse(chatId, arg, msg, threadId, fromId);
          else await this.startLinkWizard(chatId, fromId, threadId);
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      case '/unlink':
        if (await this.isAdmin(fromId)) {
          if (arg) await this.unlinkCourse(chatId, arg, threadId);
          else await this.startUnlinkWizard(chatId, fromId, threadId);
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      case '/newcourse':
        if (await this.isAdmin(fromId)) {
          if (arg.split('|').length >= 2 && arg.split('|')[0]?.trim() && arg.split('|')[1]?.trim()) {
            // one-line format still supported: /newcourse Title | Instructor | ...
            await this.newCourse(chatId, arg, threadId);
          } else {
            // otherwise start the guided wizard
            await this.startCourseWizard(chatId, fromId, threadId);
          }
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      case '/cancel':
        if (await this.loadWizard(fromId)) {
          await this.clearWizard(fromId);
          await this.sendRich(
            chatId,
            `${this.brandHeader('Cancelled')}\n\n` +
              `❌ Wizard cancelled. No changes were made.`,
            threadId,
          );
        } else {
          await this.sendText(chatId, 'Nothing to cancel — no wizard in progress.', threadId);
        }
        break;
      case '/broadcast':
        if (await this.isAdmin(fromId)) {
          if (arg) await this.broadcast(chatId, arg, threadId);
          else await this.startBroadcastWizard(chatId, fromId, threadId);
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      case '/stats':
        if (await this.isAdmin(fromId)) {
          await this.pushNav(fromId, { key: 'stats' });
          await this.sendStats(chatId, threadId, undefined, fromId);
        } else {
          await this.sendText(chatId, '⛔ This command is for admins only.', threadId);
        }
        break;
      default:
        if (text.startsWith('/')) {
          await this.sendText(chatId, `Unknown command. Send /help for the list of commands.`, threadId);
        }
    }
  }

  private async handleCallback(cb: NonNullable<TelegramUpdate['callback_query']>) {
    const chatId = cb.message?.chat.id ?? cb.from.id;
    const messageId = cb.message?.message_id;
    const data = cb.data ?? '';
    try {
      await this.api('answerCallbackQuery', { callback_query_id: cb.id });
    } catch {
      /* ignore */
    }
    const uid = cb.from.id;
    // If the tapped bubble is a PHOTO (course card with a cover), it can't be
    // edited into a text view — delete it and render the target as a fresh
    // message instead (Argo-style replace, keeps the chat clean).
    const isPhotoBubble = messageId != null && (this.photoBubbles.get(uid)?.has(messageId) ?? false);
    if (isPhotoBubble) {
      await this.deleteMessage(chatId, messageId!);
      this.photoBubbles.get(uid)?.delete(messageId!);
    }
    const msgId = isPhotoBubble ? undefined : messageId;
    if (data.startsWith('dl:')) {
      // sending a file is a new message by nature (can't edit into a document)
      await this.sendCourseFile(chatId, data.slice(3));
      // a download tap completes the interactive download picker
      await this.clearWizard(uid);
    } else if (data === 'nav:back') {
      await this.navBack(chatId, uid, msgId);
    } else if (data === 'nav:fwd') {
      await this.navFwd(chatId, uid, msgId);
    } else if (data.startsWith('pg:')) {
      const page = Number(data.slice(3));
      if (!Number.isNaN(page)) {
        // update the top nav entry's page instead of stacking a new one
        const state = await this.loadNav(uid);
        if (state && state.history.length) {
          const top = state.history[state.index];
          if (top && top.key === 'courses') top.page = page;
          await this.saveNav(uid, state);
        }
        await this.sendCourseList(chatId, undefined, page, msgId, uid);
      }
    } else if (data.startsWith('clp:')) {
      const page = Number(data.slice(4));
      if (!Number.isNaN(page)) {
        const state = await this.loadNav(uid);
        if (state && state.history.length) {
          const top = state.history[state.index];
          if (top && top.key === 'courselist') top.page = page;
          await this.saveNav(uid, state);
        }
        await this.sendCoursePicker(chatId, undefined, page, msgId, uid);
      }
    } else if (data.startsWith('course:')) {
      const slug = data.slice(7);
      await this.pushNav(uid, { key: 'course', arg: slug });
      await this.sendCourseCard(chatId, slug, undefined, msgId, uid);
    } else if (data.startsWith('edit:')) {
      const slug = data.slice(5);
      await this.startEditWizard(chatId, uid, slug);
    } else if (data.startsWith('epg:')) {
      const page = Number(data.slice(4));
      if (!Number.isNaN(page)) {
        await this.pickerFor(chatId, uid, 'edit', page, msgId);
      }
    } else if (data.startsWith('ul:')) {
      await this.unlinkCourse(chatId, data.slice(3));
    } else if (data === 'noop') {
      /* the "Page X/Y" label is not clickable */
    } else if (data === 'courses') {
      await this.pushNav(uid, { key: 'courses', page: 0 });
      await this.sendCourseList(chatId, undefined, 0, msgId, uid);
    } else if (data === 'help') {
      await this.pushNav(uid, { key: 'help' });
      await this.sendHelp(chatId, undefined, false, msgId, uid);
    } else if (data === 'home' || data === 'start') {
      await this.pushNav(uid, { key: 'home' });
      await this.sendWelcome(chatId, undefined, msgId, uid);
    } else if (data === 'stats') {
      await this.pushNav(uid, { key: 'stats' });
      await this.sendStats(chatId, undefined, msgId, uid);
    } else if (data.startsWith('wz:')) {
      await this.handleWizardCallback(chatId, cb.from.id, data, messageId);
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

  private async sendWelcome(chatId: number, threadId?: number | null, editMessageId?: number, userId?: number) {
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
    const kb: KbButton[][] = [
      [{ text: '📚 Browse courses', callback_data: 'courses' }],
      [{ text: '❓ Help', callback_data: 'help' }, { text: '🌐 Web app', url: APP_URL }],
    ];
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
  }

  private async sendHelp(chatId: number, threadId?: number | null, isAdmin = false, editMessageId?: number, userId?: number) {
    const html =
      `${this.brandHeader('Command Center')}\n\n` +
      `<b>👤 For everyone</b>\n` +
      `${DIV}\n` +
      `<code>/start</code> — welcome & quick actions\n` +
      `<code>/courses</code> — browse the catalog (tap a title to download) 📚\n` +
      `<code>/courselist</code> — pick a course from buttons 🎴\n` +
      `<code>/search</code> — find a course by keyword 🔍\n` +
      `<code>/course-detail</code> — course details card 🎴\n` +
      `<code>/download</code> — get a course file ⚡\n\n` +
      `<i>💡 <b>Two ways to use everything:</b> send the command with no args for an <b>interactive</b> walkthrough, or type it all in one line:</i>\n` +
      `<code>/course-detail Complete Machine Learning</code>\n` +
      `<code>/search machine learning</code>\n` +
      `<code>/download Complete Machine Learning</code>\n\n` +
      (isAdmin
        ? `<b>🛡️ Admin tools</b>\n${DIV}\n` +
          `<b>Interactive:</b> <code>/edit</code> → pick course → pick field → new value\n` +
          `<b>One line:</b> <code>/edit &lt;title&gt; &lt;field&gt; &lt;value&gt;</code> — fields: title | instructor | category | level | type | price | image\n` +
          `<code>/newcourse</code> — create a course (guided wizard, 7 steps)\n` +
          `<b>One line:</b> <code>/newcourse Title | Instructor | Category | type | price | image-url</code>\n` +
          `<code>/link &lt;slug&gt;</code> — attach a file to a course (reply to the ZIP, or forward it first)\n` +
          `<code>/unlink &lt;slug&gt;</code> — detach the file\n` +
          `<code>/broadcast &lt;text&gt;</code> — message all linked users 📢\n` +
          `<code>/stats</code> — platform dashboard 📊\n\n`
        : '') +
      `💡 Tip: on any course, tap <b>📥 Download</b> under its listing.\n` +
      `🔗 <a href="${APP_URL}">Explore the full catalog on the web →</a>`;
    const kb: KbButton[][] = [
      [{ text: '📚 Browse courses', callback_data: 'courses' }],
      [{ text: '🏠 Home', callback_data: 'home' }, { text: '🌐 Web app', url: APP_URL }],
    ];
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
  }

  /** Page size for the /courses catalog. */
  private static readonly CATALOG_PAGE = 8;

  /**
   * Paginated course buttons (8/page). Used by the /courselist picker and the
   * /course-detail lookup wizard. `kind` selects the callback prefix.
   */
  private async pickerButtonsFor(kind: 'course' | 'coursefind', page = 0): Promise<KbButton[][]> {
    const total = await this.prisma.course.count({ where: { deletedAt: null } });
    if (total === 0) return [];
    const pages = Math.ceil(total / TelegramService.CATALOG_PAGE);
    const safePage = Math.min(Math.max(page, 0), pages - 1);
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { title: 'asc' }],
      skip: safePage * TelegramService.CATALOG_PAGE,
      take: TelegramService.CATALOG_PAGE,
      select: { title: true, slug: true },
    });
    const kb: KbButton[][] = courses.map((c) => [
      { text: `🎴 ${c.title.slice(0, 44)}`, callback_data: `course:${c.slug}` },
    ]);
    const navRow: KbButton[] = [];
    if (safePage > 0) navRow.push({ text: '◀️ Prev', callback_data: `clp:${safePage - 1}` });
    navRow.push({ text: `📄 ${safePage + 1}/${pages}`, callback_data: 'noop' });
    if (safePage < pages - 1) navRow.push({ text: 'Next ▶️', callback_data: `clp:${safePage + 1}` });
    kb.push(navRow);
    return kb;
  }

  /**
   * /courselist — paginated PICKER of courses. Tap a button to see that
   * course's details card. 8 buttons per page with ◀️/▶️ navigation, edited in
   * place (Argo-style) so the chat never spams new messages.
   */
  private async sendCoursePicker(chatId: number, threadId?: number | null, page = 0, editMessageId?: number, userId?: number) {
    const total = await this.prisma.course.count({ where: { deletedAt: null } });
    if (total === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Course Card')}\n\n` +
          `📭 <b>No courses yet.</b>\n\n` +
          `The catalog is filling up — check back soon.`,
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
      select: { title: true, slug: true },
    });
    // Build keyboard inline — same proven pattern as sendCourseList
    const kb: KbButton[][] = courses.map((c) => [
      { text: `🎲 ${c.title.slice(0, 44)}`, callback_data: `course:${c.slug}` },
    ]);
    const navRow: KbButton[] = [];
    if (safePage > 0) navRow.push({ text: '◀️ Prev', callback_data: `clp:${safePage - 1}` });
    navRow.push({ text: `📄 ${safePage + 1}/${pages}`, callback_data: 'noop' });
    if (safePage < pages - 1) navRow.push({ text: 'Next ▶️', callback_data: `clp:${safePage + 1}` });
    kb.push(navRow);
    kb.push([
      { text: '📚 Catalog', callback_data: 'courses' },
      { text: '🏠 Home', callback_data: 'home' },
    ]);
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    const html =
      `${this.brandHeader('Course Card')}\n\n` +
      `🎴 <b>Which course's details do you want?</b>\n` +
      `Tap a button below, or type a title.\n\n` +
      `${DIV}\n<i>${total} courses · page ${safePage + 1}/${pages}</i>`;
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
  }

  /**
   * /courses — paginated catalog of ALL courses. 8 per page with ◀️/▶️
   * navigation. Download buttons only appear for courses that have a linked
   * file; the rest show 📭 no file yet. When called from a button tap
   * (editMessageId set) it EDITs the tapped message in place — no message
   * spam, just like Argo Search's pagination.
   */
  private async sendCourseList(chatId: number, threadId?: number | null, page = 0, editMessageId?: number, userId?: number) {
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
    const deepLinkBase = `https://t.me/${BOT_USERNAME}?start=dl_`;
    const rows = courses
      .map((c, i) => {
        const l = linkByCourse.get(c.id);
        const startIdx = safePage * TelegramService.CATALOG_PAGE;
        // title itself is a t.me deep-link when the file is ready — tap it
        // anywhere to receive the file; no per-course buttons needed
        const title = l
          ? `<a href="${deepLinkBase}${c.slug}">${esc(c.title)}</a>`
          : `<b>${esc(c.title)}</b>`;
        return (
          `${startIdx + i + 1}. ${title}\n` +
          `   🔑 <code>${esc(c.slug)}</code>\n` +
          (l
            ? `   📦 ${esc(l.fileName ?? 'file')}${l.fileSizeMb ? ` · ${l.fileSizeMb} MB` : ''} · ⭐ ${c.ratingAvg.toFixed(1)}`
            : `   📭 <i>no file yet</i> · ⭐ ${c.ratingAvg.toFixed(1)}`) +
          (c.lecturer ? ` · 👨‍🏫 ${esc(c.lecturer.name)}` : '')
        );
      })
      .join('\n\n');

    const kb: KbButton[][] = [];
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
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }

    const html =
      `${this.brandHeader('Course Catalog')}\n\n${rows}\n\n${DIV}\n` +
      `<i>${total} courses · page ${safePage + 1}/${pages}</i>` +
      `\n<i>Tap a course title to download it instantly ⚡</i>`;
    if (editMessageId) {
      await this.editRich(chatId, editMessageId, html, kb);
    } else {
      await this.sendRich(chatId, html, threadId, kb);
    }
  }

  /** /course-detail <title-or-slug> — premium course details card with one-tap actions. */
  private async sendCourseCard(chatId: number, arg: string, threadId?: number | null, editMessageId?: number, userId?: number) {
    if (!arg) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Course Card')}\n\n` +
          `Usage: <code>/course-detail &lt;title or slug&gt;</code>\n\n` +
          `Example: <code>/course-detail Complete Machine Learning</code>\n` +
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
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    const imageUrl = course.bannerUrl ?? course.thumbnailUrl;
    if (imageUrl) {
      // photo card — send as a NEW message (a photo can't be edited into a
      // text view). Its buttons are handled by handleCallback: the bubble is
      // deleted and the tapped view is sent fresh (Argo-style replace).
      const mid = await this.sendPhoto(chatId, imageUrl, html, kb, threadId);
      if (mid && userId) {
        const set = this.photoBubbles.get(userId) ?? new Set();
        set.add(mid);
        this.photoBubbles.set(userId, set);
      }
      if (mid) return;
      // photo failed (e.g. t.me link isn't a real image) — fall back to text
    }
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
  }

  /** Route wizard button presses (category / level / type / confirm / cancel). */
  private async handleWizardCallback(
    chatId: number,
    userId: number,
    data: string,
    messageId?: number,
  ) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) {
      await this.sendText(chatId, 'No wizard in progress — send /newcourse to start one.');
      return;
    }
    if (Date.now() > wizard.expiresAt) {
      await this.clearWizard(userId);
      await this.sendText(chatId, '⏳ The wizard expired (30 min). Send /newcourse to start over.');
      return;
    }
    // the tapped message IS the wizard bubble — remember it for in-place edits
    if (messageId) wizard.messageId = messageId;
    await this.saveWizard(userId, wizard);
    if (data.startsWith('wz:cat:')) {
      wizard.data.categoryId = data.slice(7);
      wizard.step = 'level';
      await this.askWizardLevel(chatId, userId);
    } else if (data.startsWith('wz:lvl:')) {
      wizard.data.levelName = data.slice(7);
      wizard.step = 'type';
      await this.askWizardType(chatId, userId);
    } else if (data.startsWith('wz:type:')) {
      wizard.data.contentType = data.slice(8);
      wizard.step = 'price';
      await this.sendWizardStep(
        chatId,
        userId,
        `${this.brandHeader('New Course Wizard')}\n\n` +
          `<b>Step 6/7 · Price</b>\n\n` +
          `💵 What's the <b>price in USD</b>?\n` +
          `Type a number like <code>49.99</code>, or <code>free</code>.`,
      );
    } else if (data.startsWith('wz:ef:')) {
      const field = data.slice(6) as CourseWizard['data']['editField'];
      await this.askEditValue(chatId, userId, field);
    } else if (data.startsWith('wz:ev:cat:')) {
      wizard.data.editField = 'category';
      await this.saveWizard(userId, wizard);
      await this.applyEditChoice(chatId, userId, undefined, data.slice(10));
    } else if (data.startsWith('wz:ev:lvl:')) {
      wizard.data.editField = 'level';
      await this.saveWizard(userId, wizard);
      await this.applyEditChoice(chatId, userId, undefined, data.slice(10));
    } else if (data.startsWith('wz:ev:type:')) {
      wizard.data.editField = 'type';
      await this.saveWizard(userId, wizard);
      await this.applyEditChoice(chatId, userId, undefined, data.slice(11));
    } else if (data === 'wz:create') {
      await this.createCourseFromWizard(chatId, userId);
    } else if (data === 'wz:cancel') {
      await this.clearWizard(userId);
      await this.sendRich(
        chatId,
        `${this.brandHeader('Cancelled')}\n\n` +
          `❌ Course creation cancelled. No changes were made.`,
      );
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

  // ---------------------------------------------------------------
  // Interactive wizards (course creation / search / download)
  // ---------------------------------------------------------------

  /**
   * Show the next wizard step. If the wizard already has a bubble, EDIT it in
   * place (Argo-style, no message spam); otherwise send a new one. Always
   * persists so a restart can't lose the flow.
   */
  private async sendWizardStep(
    chatId: number,
    userId: number,
    html: string,
    keyboard?: KbButton[][],
    threadId?: number | null,
  ) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) return;
    if (wizard.messageId) {
      await this.editRich(chatId, wizard.messageId, html, keyboard);
    } else {
      const mid = await this.sendRich(chatId, html, threadId, keyboard);
      if (mid) wizard.messageId = mid;
      await this.saveWizard(userId, wizard);
    }
  }

  // ----- course creation wizard -----

  /** Begin the guided course creation flow. */
  private async startCourseWizard(chatId: number, userId: number, threadId?: number | null) {
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'course',
      step: 'title',
      data: {},
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('New Course Wizard')}\n\n` +
        `Let's create a course together — 7 quick steps, no command syntax needed. ✨\n\n` +
        `<b>Step 1/7 · Title</b>\n\n` +
        `📝 What is the course <b>title</b>?\n` +
        `Just type it, e.g. <i>Hands-On AI: Building Your First LLM-Powered App</i>\n\n` +
        `Send <code>/cancel</code> anytime to abort.`,
      undefined,
      threadId,
    );
  }

  /** Feed plain-text answers into the active wizard. */
  private async handleWizardText(
    chatId: number,
    userId: number,
    text: string,
    threadId: number | null | undefined,
    wizard: CourseWizard,
  ) {
    if (Date.now() > wizard.expiresAt) {
      await this.clearWizard(userId);
      await this.sendText(chatId, '⏳ The wizard expired (30 min). Start over with /newcourse.', threadId);
      return;
    }
    if (wizard.kind === 'search' && wizard.step === 'keyword') {
      await this.searchCourses(chatId, text, threadId, wizard.messageId);
      await this.clearWizard(userId);
      return;
    }
    if (wizard.kind === 'broadcast' && wizard.step === 'text') {
      await this.broadcast(chatId, text, threadId);
      await this.clearWizard(userId);
      return;
    }
    if (wizard.kind === 'download' && wizard.step === 'pick') {
      const slug = await this.resolveSlugByArg(text);
      if (slug) {
        await this.clearWizard(userId);
        await this.sendCourseFile(chatId, slug, threadId);
      } else {
        await this.sendWizardStep(
          chatId,
          userId,
          `${this.brandHeader('Download')}\n\n` +
            `❌ Couldn't find <code>${esc(text)}</code>. Type a course <b>title</b>, or tap a button below 👇`,
          await this.downloadPickerButtons(),
          threadId,
        );
      }
      return;
    }
    // /course-detail with no args — user types a name or slug, we find the match
    if (wizard.kind === 'coursefind' && wizard.step === 'name') {
      const slug = await this.resolveSlugByArg(text);
      if (slug) {
        const mid = wizard.messageId;
        await this.clearWizard(userId);
        await this.sendCourseCard(chatId, slug, threadId, mid, userId);
      } else {
        const suggestions = await this.titleSuggestions(text);
        await this.sendWizardStep(
          chatId,
          userId,
          `${this.brandHeader('Course Card')}\n\n` +
            `❌ No course matches <code>${esc(text)}</code>.\n\n` +
            (suggestions.length ? `Did you mean:\n${suggestions}\n\n` : '') +
            `Type a course <b>name or slug</b> — or send <code>/courses</code> to browse the catalog.`,
          undefined,
          threadId,
        );
      }
      return;
    }
    // /edit — the user typed the new value for the field they chose
    if (wizard.kind === 'edit' && wizard.step === 'value') {
      await this.applyEditField(chatId, userId, threadId, wizard, { textValue: text });
      return;
    }
    switch (wizard.step) {
      case 'title':
        wizard.data.title = text;
        wizard.step = 'instructor';
        await this.saveWizard(userId, wizard);
        await this.sendWizardStep(
          chatId,
          userId,
          `${this.brandHeader('New Course Wizard')}\n\n` +
            `✅ Title: <b>“${esc(text)}”</b>\n\n` +
            `<b>Step 2/7 · Instructor</b>\n\n` +
            `👨‍🏫 Who is the <b>instructor</b>? (name)\n` +
            `e.g. <i>Han-chung Lee</i>`,
          undefined,
          threadId,
        );
        break;
      case 'instructor':
        wizard.data.instructor = text;
        wizard.step = 'category';
        await this.saveWizard(userId, wizard);
        await this.askWizardCategory(chatId, userId, threadId);
        break;
      case 'price': {
        const cleaned = text.replace(/[$,]/g, '').trim();
        const lower = cleaned.toLowerCase();
        if (lower === 'free' || lower === '0' || lower === '') {
          wizard.data.price = null;
        } else {
          const num = Number(cleaned);
          if (Number.isNaN(num) || num < 0) {
            await this.sendWizardStep(
              chatId,
              userId,
              `${this.brandHeader('New Course Wizard')}\n\n` +
                `⚠️ <b>Step 6/7 · Price</b>\n\n` +
                `That doesn't look like a price. Send a number like <code>49.99</code>, or <code>free</code>.`,
              undefined,
              threadId,
            );
            return;
          }
          wizard.data.price = num;
        }
        wizard.step = 'image';
        await this.saveWizard(userId, wizard);
        await this.sendWizardStep(
          chatId,
          userId,
          `${this.brandHeader('New Course Wizard')}\n\n` +
            `✅ Price: <b>${wizard.data.price == null ? 'Free' : `$${wizard.data.price}`}</b>\n\n` +
            `<b>Step 7/7 · Cover image</b> (optional)\n\n` +
            `🖼️ <b>Send a photo</b> directly here, paste an <b>image URL</b>, or send <code>skip</code>.`,
          undefined,
          threadId,
        );
        break;
      }
      case 'image':
        wizard.data.imageUrl = text.toLowerCase() === 'skip' ? null : text;
        wizard.data.imageIsTelegram = false;
        wizard.step = 'confirm';
        await this.saveWizard(userId, wizard);
        await this.showWizardConfirm(chatId, userId, threadId);
        break;
      default:
        await this.sendText(chatId, 'Please use the buttons below.', threadId);
    }
  }

  /** Step 3 — pick a category from the catalog (button list). */
  private async askWizardCategory(chatId: number, userId: number, threadId?: number | null) {
    const cats = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    const kb: KbButton[][] = [];
    for (let i = 0; i < cats.length; i += 2) {
      const row: KbButton[] = [];
      if (cats[i]) row.push({ text: `🏷️ ${cats[i].name}`, callback_data: `wz:cat:${cats[i].id}` });
      if (cats[i + 1]) row.push({ text: `🏷️ ${cats[i + 1].name}`, callback_data: `wz:cat:${cats[i + 1].id}` });
      kb.push(row);
    }
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('New Course Wizard')}\n\n` +
        `<b>Step 3/7 · Category</b>\n\n` +
        `🏷️ Pick a <b>category</b> from the buttons below 👇`,
      kb,
      threadId,
    );
  }

  /** Step 4 — pick a level (button list). */
  private async askWizardLevel(chatId: number, userId: number, threadId?: number | null) {
    const levels = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'];
    const kb: KbButton[][] = [levels.slice(0, 2).map((l) => ({ text: `🔰 ${l}`, callback_data: `wz:lvl:${l}` }))];
    kb.push(levels.slice(2).map((l) => ({ text: `🔰 ${l}`, callback_data: `wz:lvl:${l}` })));
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('New Course Wizard')}\n\n` +
        `<b>Step 4/7 · Level</b>\n\n` +
        `🔰 What <b>level</b> is this course?`,
      kb,
      threadId,
    );
  }

  /** Step 5 — pick content type (button list). */
  private async askWizardType(chatId: number, userId: number, threadId?: number | null) {
    const kb: KbButton[][] = [
      [
        { text: '📘 Course', callback_data: 'wz:type:course' },
        { text: '📗 Mini-course', callback_data: 'wz:type:mini-course' },
      ],
      [
        { text: '📋 Cheat-sheet', callback_data: 'wz:type:cheat-sheet' },
        { text: '🗺️ Roadmap', callback_data: 'wz:type:roadmap' },
      ],
    ];
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('New Course Wizard')}\n\n` +
        `<b>Step 5/7 · Content type</b>\n\n` +
        `📦 What kind of content is this?`,
      kb,
      threadId,
    );
  }

  /** Final review — show everything and let the admin confirm. */
  private async showWizardConfirm(chatId: number, userId: number, threadId?: number | null) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) return;
    const d = wizard.data;
    const cat = d.categoryId
      ? await this.prisma.category.findUnique({ where: { id: d.categoryId }, select: { name: true } })
      : null;
    const typeMap: Record<string, string> = { course: '📘 Course', 'mini-course': '📗 Mini-course', 'cheat-sheet': '📋 Cheat-sheet', roadmap: '🗺️ Roadmap' };
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('New Course Wizard')}\n\n` +
        `📋 <b>Review your course</b> — everything correct?\n\n` +
        `${DIV}\n` +
        `📝 <b>${esc(d.title ?? '—')}</b>\n` +
        `👨‍🏫 ${esc(d.instructor ?? '—')}\n` +
        `🏷️ ${cat ? esc(cat.name) : '—'}\n` +
        `🔰 ${esc(d.levelName ?? '—')}\n` +
        `📦 ${typeMap[d.contentType ?? ''] ?? '—'}\n` +
        `💵 ${d.price == null ? 'Free' : `$${d.price}`}\n` +
        (d.imageUrl ? `🖼️ <a href="${esc(d.imageUrl)}">cover</a>\n` : '') +
        `${DIV}\n\n` +
        `Tap <b>✅ Create course</b> to publish it instantly — it will appear on the site and in <code>/courses</code>.`,
      [
        [{ text: '✅ Create course', callback_data: 'wz:create' }],
        [{ text: '❌ Cancel', callback_data: 'wz:cancel' }],
      ],
      threadId,
    );
  }

  /** Actually create the course from wizard data. */
  private async createCourseFromWizard(chatId: number, userId: number) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) return;
    const d = wizard.data;
    if (!d.title || !d.instructor) {
      await this.sendText(chatId, 'Wizard data is incomplete — start over with /newcourse.');
      await this.clearWizard(userId);
      return;
    }
    try {
      const lecturer = await this.prisma.lecturer.upsert({
        where: { slug: slugify(d.instructor) },
        update: {},
        create: { name: d.instructor, slug: slugify(d.instructor) },
      });
      const level = d.levelName
        ? await this.prisma.level.findFirst({ where: { name: d.levelName } })
        : null;
      const slug = await this.uniqueCourseSlug(slugify(d.title));
      const coverUrl = d.imageUrl ? await this.resolveImageUrl(d.imageUrl, Boolean(d.imageIsTelegram)) : null;
      const course = await this.prisma.course.create({
        data: {
          title: d.title,
          slug,
          description: `Learn ${d.title} — brought to you by Syncourse. Start learning today.`,
          lecturerId: lecturer.id,
          levelId: level?.id ?? null,
          contentType: ['mini-course', 'cheat-sheet', 'roadmap'].includes(d.contentType ?? '') ? d.contentType! : 'course',
          price: d.price ?? null,
          originalPrice: d.price ?? null,
          thumbnailUrl: coverUrl,
          ...(d.categoryId
            ? { categories: { create: [{ categoryId: d.categoryId }] } }
            : {}),
        },
      });
      const catName = d.categoryId
        ? (await this.prisma.category.findUnique({ where: { id: d.categoryId }, select: { name: true } }))?.name
        : null;
      await this.clearWizard(userId);
      await this.logActivity(userId, chatId, 'course', `created ${slug}`);
      await this.sendRich(
        chatId,
        `${this.brandHeader('Course Created')}\n\n` +
          `✅ <b>“${esc(course.title)}”</b> is live on the site!\n\n` +
          `👨‍🏫 ${esc(d.instructor)}${catName ? ` · 🏷️ ${esc(catName)}` : ''}${d.price != null ? ` · 💵 $${d.price}` : ' · 💵 Free'}\n` +
          `🔗 <a href="${APP_URL}/courses/${course.slug}">Open the course →</a>\n\n` +
          `<b>Next:</b> attach the file — forward the ZIP to this bot, then send:\n<code>/link ${course.slug}</code>`,
        undefined,
        [[{ text: '🔗 Link a file', callback_data: `link:${course.slug}` }], [{ text: '📊 Stats', callback_data: 'stats' }]],
      );
    } catch (err) {
      this.logger.error(`createCourseFromWizard failed: ${(err as Error).message}`);
      await this.sendText(chatId, 'Could not create the course — something went wrong. Try again with /newcourse.');
    }
  }

  // ----- search wizard -----

  /** /search with no args — ask for a keyword (single bubble, edited in place). */
  private async startSearchWizard(chatId: number, userId: number, threadId?: number | null) {
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'search',
      step: 'keyword',
      data: {},
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('Search')}\n\n` +
        `🔍 What would you like to <b>search</b> for?\n` +
        `Type a keyword, e.g. <i>machine learning</i> — or just send <code>/courses</code> to browse.`,
      undefined,
      threadId,
    );
  }

  // ----- download wizard -----

  /** Buttons for the interactive download picker (only courses with files). */
  private async downloadPickerButtons(): Promise<KbButton[][]> {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (links.length === 0) return [];
    return links.map((l) => [
      { text: `📥 ${l.course.title.slice(0, 40)}`, callback_data: `dl:${l.course.slug}` },
    ]);
  }

  /** /download with no args — ask which course (single bubble, edited in place). */
  private async startDownloadWizard(chatId: number, userId: number, threadId?: number | null) {
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'download',
      step: 'pick',
      data: {},
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    const buttons = await this.downloadPickerButtons();
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('Download')}\n\n` +
        `📥 Which course would you like?\n` +
        `Tap a button below, or type a course <b>title</b>.`,
      buttons,
      threadId,
    );
  }

  // ----- course lookup (/course-detail) -----

  /** /course-detail with no args — prompt for a name or slug, then find the match. */
  private async startCourseLookup(chatId: number, userId: number, threadId?: number | null) {
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'coursefind',
      step: 'name',
      data: {},
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('Course Card')}\n\n` +
        `🎴 Which course do you want to see?\n` +
        `Type the course <b>name</b> or <b>slug</b> — e.g. <i>machine learning</i>\n\n` +
        `💡 Tip: use <code>/courselist</code> to pick one from buttons instead.`,
      undefined,
      threadId,
    );
  }

  // ----- link wizard (/link) -----

  /** /link with no args — pick the course, then guide the file attach. */
  private async startLinkWizard(chatId: number, userId: number, threadId?: number | null) {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      select: { title: true, slug: true },
      take: 20,
    });
    if (courses.length === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `📭 <b>No courses yet.</b> Create one with <code>/newcourse</code> first.`,
        threadId,
      );
    }
    const kb: KbButton[][] = courses.map((c) => [
      { text: `🔗 ${c.title.slice(0, 42)}`, callback_data: `link:${c.slug}` },
    ]);
    kb.push([{ text: '🏠 Home', callback_data: 'home' }]);
    await this.sendRich(
      chatId,
      `${this.brandHeader('Link a File')}\n\n` +
        `🔗 Which course should get the file?\n` +
        `Tap a course below, then forward the ZIP / reply to it.`,
      threadId,
      kb,
    );
  }

  // ----- unlink wizard (/unlink) -----

  /** /unlink with no args — pick a linked course to detach. */
  private async startUnlinkWizard(chatId: number, userId: number, threadId?: number | null) {
    const links = await this.prisma.telegramCourseLink.findMany({
      include: { course: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (links.length === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Unlink')}\n\n` +
          `📭 <b>No linked files.</b> Link one first with <code>/link</code>.`,
        threadId,
      );
    }
    const kb: KbButton[][] = links.map((l) => [
      { text: `🗑️ ${l.course.title.slice(0, 42)}`, callback_data: `ul:${l.course.slug}` },
    ]);
    kb.push([{ text: '🏠 Home', callback_data: 'home' }]);
    await this.sendRich(
      chatId,
      `${this.brandHeader('Unlink')}\n\n` +
        `🗑️ Which course should have its file <b>detached</b>?`,
      threadId,
      kb,
    );
  }

  // ----- broadcast wizard (/broadcast) -----

  /** /broadcast with no args — ask for the message text. */
  private async startBroadcastWizard(chatId: number, userId: number, threadId?: number | null) {
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'broadcast',
      step: 'text',
      data: {},
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('Broadcast')}\n\n` +
        `📢 What message should I send to <b>all linked users</b>?\n` +
        `Type it below — it goes out to everyone instantly.`,
      undefined,
      threadId,
    );
  }

  // ----- edit course wizard (/edit) -----

  /** Generic paginated course picker (8/page, single bubble). Used by /edit. */
  private async pickerFor(
    chatId: number,
    userId: number,
    kind: 'edit',
    page = 0,
    editMessageId?: number,
    threadId?: number | null,
  ) {
    const total = await this.prisma.course.count({ where: { deletedAt: null } });
    if (total === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Edit Course')}\n\n` +
          `📭 <b>No courses yet.</b> Create one with <code>/newcourse</code> first.`,
        threadId,
      );
    }
    const PAGE = 8;
    const pages = Math.ceil(total / PAGE);
    const safePage = Math.min(Math.max(page, 0), pages - 1);
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      skip: safePage * PAGE,
      take: PAGE,
      select: { title: true, slug: true },
    });
    const kb: KbButton[][] = courses.map((c) => [
      { text: `✏️ ${c.title.slice(0, 44)}`, callback_data: `edit:${c.slug}` },
    ]);
    const navRow: KbButton[] = [];
    if (safePage > 0) navRow.push({ text: '◀️ Prev', callback_data: `epg:${safePage - 1}` });
    navRow.push({ text: `📄 ${safePage + 1}/${pages}`, callback_data: 'noop' });
    if (safePage < pages - 1) navRow.push({ text: 'Next ▶️', callback_data: `epg:${safePage + 1}` });
    kb.push(navRow);
    kb.push([{ text: '🏠 Home', callback_data: 'home' }]);
    const html =
      `${this.brandHeader('Edit Course')}\n\n` +
      `✏️ Which course do you want to <b>edit</b>?\n` +
      `Tap a course below, or send <code>/edit &lt;title&gt;</code> directly.\n\n` +
      `${DIV}\n<i>${total} courses · page ${safePage + 1}/${pages}</i>`;
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
  }

  /**
   * One-line edit for power users: /edit <title> <field> <value>
   * Fields: title | instructor | category | level | type | price | image
   * Reuses the wizard machinery so validation + confirmation are identical.
   */
  private async editCourseOneLine(
    chatId: number,
    userId: number,
    titleArg: string,
    field: string,
    value: string,
    threadId?: number | null,
  ) {
    const slug = await this.resolveSlugByArg(titleArg);
    if (!slug) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Edit Course')}\n\n` +
          `❌ No course matches <code>${esc(titleArg)}</code>.\n\n` +
          `Usage: <code>/edit &lt;title&gt; &lt;field&gt; &lt;value&gt;</code>\n` +
          `Fields: <code>title | instructor | category | level | type | price | image</code>`,
        threadId,
      );
    }
    if (!value) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Edit Course')}\n\n` +
          `❌ Missing the new value.\n\n` +
          `Usage: <code>/edit &lt;title&gt; &lt;field&gt; &lt;value&gt;</code>`,
        threadId,
      );
    }
    const course = await this.prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (!course) return;
    if (!['title', 'instructor', 'category', 'level', 'type', 'price', 'image'].includes(field)) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Edit Course')}\n\n` +
          `❌ Unknown field <code>${esc(field)}</code>.\n\n` +
          `Fields: <code>title | instructor | category | level | type | price | image</code>`,
        threadId,
      );
    }
    const wizard: CourseWizard = {
      kind: 'edit',
      step: 'value',
      data: { editCourseId: course.id, editCourseSlug: slug, editField: field as CourseWizard['data']['editField'] },
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    if (field === 'category') {
      let cat = await this.prisma.category.findFirst({
        where: { OR: [{ slug: slugify(value) }, { name: { equals: value, mode: 'insensitive' } }] },
      });
      if (!cat) {
        cat = await this.prisma.category.create({ data: { name: value, slug: slugify(value), icon: '📚' } });
      }
      await this.applyEditChoice(chatId, userId, threadId, cat.id);
    } else if (field === 'level' || field === 'type') {
      await this.applyEditChoice(chatId, userId, threadId, value);
    } else {
      await this.applyEditField(chatId, userId, threadId, wizard, { textValue: value });
    }
  }

  /** /edit <title-or-slug> — pick a field, then change it. */
  private async startEditWizard(chatId: number, userId: number, arg: string, threadId?: number | null) {
    const slug = await this.resolveSlugByArg(arg);
    if (!slug) {
      const suggestions = await this.titleSuggestions(arg);
      return this.sendRich(
        chatId,
        `${this.brandHeader('Edit Course')}\n\n` +
          `❌ No course matches <code>${esc(arg)}</code>.\n\n` +
          (suggestions.length ? `Did you mean:\n${suggestions}\n\n` : '') +
          `Try <code>/edit &lt;title&gt;</code> or send <code>/edit</code> to pick from a list.`,
        threadId,
      );
    }
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });
    if (!course) return;
    await this.clearWizard(userId);
    const wizard: CourseWizard = {
      kind: 'edit',
      step: 'field',
      data: { editCourseId: course.id, editCourseSlug: course.slug },
      expiresAt: Date.now() + WIZARD_TTL_MS,
    };
    await this.saveWizard(userId, wizard);
    await this.sendWizardStep(
      chatId,
      userId,
      `${this.brandHeader('Edit Course')}\n\n` +
        `✏️ Editing <b>“${esc(course.title)}”</b>\n\n` +
        `What would you like to <b>change</b>?`,
      [
        [
          { text: '📝 Title', callback_data: 'wz:ef:title' },
          { text: '👨‍🏫 Instructor', callback_data: 'wz:ef:instructor' },
        ],
        [
          { text: '🏷️ Category', callback_data: 'wz:ef:category' },
          { text: '🔰 Level', callback_data: 'wz:ef:level' },
        ],
        [
          { text: '📦 Content type', callback_data: 'wz:ef:type' },
          { text: '💵 Price', callback_data: 'wz:ef:price' },
        ],
        [{ text: '🖼️ Cover image', callback_data: 'wz:ef:image' }],
        [{ text: '❌ Cancel', callback_data: 'wz:cancel' }],
      ],
      threadId,
    );
  }

  /** Human label for an editable field. */
  private editFieldLabel(field: CourseWizard['data']['editField']): string {
    const map: Record<string, string> = {
      title: 'Title',
      instructor: 'Instructor',
      category: 'Category',
      level: 'Level',
      type: 'Content type',
      price: 'Price',
      image: 'Cover image',
    };
    return field ? (map[field] ?? field) : '';
  }

  /** Ask for the new value of the chosen field (text prompts + button pickers). */
  private async askEditValue(
    chatId: number,
    userId: number,
    field: CourseWizard['data']['editField'],
    threadId?: number | null,
  ) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) return;
    wizard.data.editField = field;
    wizard.step = 'value';
    await this.saveWizard(userId, wizard);
    const header = `${this.brandHeader('Edit Course')}\n\n✏️ <b>${esc(this.editFieldLabel(field))}</b> — new value:\n\n`;
    if (field === 'category') {
      const cats = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
      const kb: KbButton[][] = [];
      for (let i = 0; i < cats.length; i += 2) {
        const row: KbButton[] = [];
        if (cats[i]) row.push({ text: `🏷️ ${cats[i].name}`, callback_data: `wz:ev:cat:${cats[i].id}` });
        if (cats[i + 1]) row.push({ text: `🏷️ ${cats[i + 1].name}`, callback_data: `wz:ev:cat:${cats[i + 1].id}` });
        kb.push(row);
      }
      await this.sendWizardStep(chatId, userId, header + `Tap the new <b>category</b> 👇`, kb, threadId);
    } else if (field === 'level') {
      const levels = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'];
      const kb: KbButton[][] = [
        levels.slice(0, 2).map((l) => ({ text: `🔰 ${l}`, callback_data: `wz:ev:lvl:${l}` })),
        levels.slice(2).map((l) => ({ text: `🔰 ${l}`, callback_data: `wz:ev:lvl:${l}` })),
      ];
      await this.sendWizardStep(chatId, userId, header + `Tap the new <b>level</b> 👇`, kb, threadId);
    } else if (field === 'type') {
      const kb: KbButton[][] = [
        [
          { text: '📘 Course', callback_data: 'wz:ev:type:course' },
          { text: '📗 Mini-course', callback_data: 'wz:ev:type:mini-course' },
        ],
        [
          { text: '📋 Cheat-sheet', callback_data: 'wz:ev:type:cheat-sheet' },
          { text: '🗺️ Roadmap', callback_data: 'wz:ev:type:roadmap' },
        ],
      ];
      await this.sendWizardStep(chatId, userId, header + `Tap the new <b>content type</b> 👇`, kb, threadId);
    } else if (field === 'image') {
      await this.sendWizardStep(
        chatId,
        userId,
        header +
          `🖼️ <b>Send a photo</b> directly here, paste an <b>image URL</b>, or send <code>skip</code> to keep the current cover.`,
        undefined,
        threadId,
      );
    } else if (field === 'price') {
      await this.sendWizardStep(
        chatId,
        userId,
        header + `💵 Type the new <b>price in USD</b> (e.g. <code>49.99</code>) or <code>free</code>.`,
        undefined,
        threadId,
      );
    } else {
      const hint =
        field === 'title'
          ? `e.g. <i>Hands-On AI: Building Your First LLM-Powered App</i>\n`
          : field === 'instructor'
            ? `e.g. <i>Han-chung Lee</i>\n`
            : '';
      await this.sendWizardStep(chatId, userId, header + `${hint}Just type the new value.`, undefined, threadId);
    }
  }

  /** Apply a text-based edit (title / instructor / price / image URL). */
  private async applyEditField(
    chatId: number,
    userId: number,
    threadId: number | null | undefined,
    wizard: CourseWizard,
    input: { textValue?: string; imageTelegramFileId?: string },
  ) {
    const field = wizard.data.editField;
    const courseId = wizard.data.editCourseId;
    if (!field || !courseId) {
      await this.sendText(chatId, 'Edit session is incomplete — start over with /edit.', threadId);
      await this.clearWizard(userId);
      return;
    }
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, slug: true },
    });
    if (!course) {
      await this.clearWizard(userId);
      return;
    }
    let valueLabel = '';
    try {
      if (field === 'title' && input.textValue) {
        const title = input.textValue.trim();
        if (!title) {
          await this.sendWizardStep(chatId, userId, `${this.brandHeader('Edit Course')}\n\n⚠️ Title can't be empty.`, undefined, threadId);
          return;
        }
        const newSlug = await this.uniqueCourseSlug(slugify(title));
        await this.prisma.course.update({ where: { id: course.id }, data: { title, slug: newSlug } });
        valueLabel = `📝 <b>“${esc(title)}”</b>`;
      } else if (field === 'instructor' && input.textValue) {
        const name = input.textValue.trim();
        if (!name) {
          await this.sendWizardStep(chatId, userId, `${this.brandHeader('Edit Course')}\n\n⚠️ Instructor can't be empty.`, undefined, threadId);
          return;
        }
        const lecturer = await this.prisma.lecturer.upsert({
          where: { slug: slugify(name) },
          update: {},
          create: { name, slug: slugify(name) },
        });
        await this.prisma.course.update({ where: { id: course.id }, data: { lecturerId: lecturer.id } });
        valueLabel = `👨‍🏫 ${esc(name)}`;
      } else if (field === 'price') {
        const cleaned = (input.textValue ?? '').replace(/[$,]/g, '').trim();
        const lower = cleaned.toLowerCase();
        if (lower === 'free' || lower === '0' || lower === '') {
          await this.prisma.course.update({ where: { id: course.id }, data: { price: null } });
          valueLabel = '💵 <b>Free</b>';
        } else {
          const num = Number(cleaned);
          if (Number.isNaN(num) || num < 0) {
            await this.sendWizardStep(
              chatId,
              userId,
              `${this.brandHeader('Edit Course')}\n\n⚠️ That doesn't look like a price. Send a number like <code>49.99</code>, or <code>free</code>.`,
              undefined,
              threadId,
            );
            return;
          }
          await this.prisma.course.update({ where: { id: course.id }, data: { price: num } });
          valueLabel = `💵 <b>$${num}</b>`;
        }
      } else if (field === 'image') {
        if (input.imageTelegramFileId) {
          const url = await this.resolveImageUrl(input.imageTelegramFileId, true);
          await this.prisma.course.update({ where: { id: course.id }, data: { thumbnailUrl: url } });
          valueLabel = '🖼️ new cover uploaded ✅';
        } else if (input.textValue && input.textValue.toLowerCase() !== 'skip') {
          await this.prisma.course.update({ where: { id: course.id }, data: { thumbnailUrl: input.textValue } });
          valueLabel = '🖼️ cover updated';
        } else {
          valueLabel = '🖼️ cover unchanged';
        }
      } else {
        await this.sendText(chatId, 'Please use the buttons below.', threadId);
        return;
      }
    } catch (err) {
      this.logger.error(`applyEditField failed: ${(err as Error).message}`);
      await this.sendText(chatId, 'Could not save that change — something went wrong.', threadId);
      return;
    }
    const mid = wizard.messageId;
    await this.clearWizard(userId);
    await this.logActivity(userId, chatId, 'course', `edited ${course.slug} (${field})`);
    const updated = `${this.brandHeader('Course Updated')}\n\n` +
      `✅ <b>“${esc(course.title)}”</b> — ${esc(this.editFieldLabel(field))} saved\n\n` +
      `${valueLabel}\n\n` +
      `${DIV}\nChanges are live on the site and in the bot instantly.`;
    const kb = [[{ text: '🎴 View updated card', callback_data: `course:${course.slug}` }], [{ text: '🏠 Home', callback_data: 'home' }]];
    if (mid) await this.editRich(chatId, mid, updated, kb);
    else await this.sendRich(chatId, updated, threadId, kb);
  }

  /** Apply a button-based edit (category / level / content type). */
  private async applyEditChoice(chatId: number, userId: number, threadId: number | null | undefined, value: string) {
    const wizard = await this.loadWizard(userId);
    if (!wizard) return;
    const field = wizard.data.editField;
    const courseId = wizard.data.editCourseId;
    if (!field || !courseId || !['category', 'level', 'type'].includes(field)) return;
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true, slug: true, title: true } });
    if (!course) {
      await this.clearWizard(userId);
      return;
    }
    let valueLabel = '';
    try {
      if (field === 'category') {
        const cat = await this.prisma.category.findUnique({ where: { id: value }, select: { id: true, name: true } });
        if (!cat) return;
        await this.prisma.courseCategory.deleteMany({ where: { courseId: course.id } });
        await this.prisma.courseCategory.create({ data: { courseId: course.id, categoryId: cat.id } });
        valueLabel = `🏷️ ${esc(cat.name)}`;
      } else if (field === 'level') {
        const level = await this.prisma.level.findFirst({ where: { name: value } });
        await this.prisma.course.update({ where: { id: course.id }, data: { levelId: level?.id ?? null } });
        valueLabel = `🔰 ${esc(value)}`;
      } else if (field === 'type') {
        const ok = ['course', 'mini-course', 'cheat-sheet', 'roadmap'].includes(value);
        await this.prisma.course.update({ where: { id: course.id }, data: { contentType: ok ? value : 'course' } });
        valueLabel = `📦 ${esc(value)}`;
      }
    } catch (err) {
      this.logger.error(`applyEditChoice failed: ${(err as Error).message}`);
      await this.sendText(chatId, 'Could not save that change — something went wrong.', threadId);
      return;
    }
    const mid = wizard.messageId;
    await this.clearWizard(userId);
    await this.logActivity(userId, chatId, 'course', `edited ${course.slug} (${field})`);
    const updated = `${this.brandHeader('Course Updated')}\n\n` +
      `✅ <b>“${esc(course.title)}”</b> — ${esc(this.editFieldLabel(field))} saved\n\n` +
      `${valueLabel}\n\n` +
      `${DIV}\nChanges are live on the site and in the bot instantly.`;
    const kb = [[{ text: '🎴 View updated card', callback_data: `course:${course.slug}` }], [{ text: '🏠 Home', callback_data: 'home' }]];
    if (mid) await this.editRich(chatId, mid, updated, kb);
    else await this.sendRich(chatId, updated, threadId, kb);
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
    // Accept both argument orders:
    //   /link <slug> <t.me link>          (classic)
    //   /link <t.me link> <slug>          (link first — easier to paste)
    const tokens = arg.split(/\s+/).filter(Boolean);
    let slug = tokens[0] ?? '';
    let url = tokens[1] ?? '';
    const looksLikeLink = (t: string) =>
      t.startsWith('http://') || t.startsWith('https://') || t.startsWith('t.me/');
    if (tokens[0] && looksLikeLink(tokens[0])) {
      url = tokens[0];
      slug = tokens[1] ?? '';
    }
    if (!slug || slug.includes('<') || slug.includes('>')) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Link a File')}\n\n` +
          `<b>Easiest way:</b> in the group, <b>REPLY to the ZIP message</b> with:\n` +
          `<code>/link &lt;course-slug&gt;</code>\n\n` +
          `<b>Or in the DM (either order):</b>\n` +
          `<code>/link &lt;slug&gt; &lt;t.me/group/TOPIC/MESSAGE&gt;</code>\n` +
          `<code>/link &lt;t.me/group/TOPIC/MESSAGE&gt; &lt;slug&gt;</code>\n\n` +
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
    // NOTE: a t.me URL takes priority over the cached file, so pasting
    // `/link <t.me link> <slug>` always attaches the file AT that link — it
    // never silently reuses a photo the user sent earlier.
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
      : cached && !reply && !url
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
    if (reply && !url) {
      return this.sendText(chatId, 'The message you replied to does not contain a file (ZIP/video/audio). Reply to the file message itself.', threadId);
    }

    // Mode 2: no file cached yet — guide the admin clearly.
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
  private async sendStats(chatId: number, threadId?: number | null, editMessageId?: number, userId?: number) {
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
    const kb: KbButton[][] = [
      [{ text: '📚 Catalog', callback_data: 'courses' }, { text: '🏠 Home', callback_data: 'home' }],
    ];
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
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
      bannerUrl: true,
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
  private async searchCourses(
    chatId: number,
    arg: string,
    threadId?: number | null,
    editMessageId?: number,
    userId?: number,
  ) {
    const words = arg.split(/\s+/).filter(Boolean);
    if (!arg || words.length === 0) {
      return this.sendRich(
        chatId,
        `${this.brandHeader('Search')}\n\n` +
          `Usage: <code>/search &lt;keyword&gt;</code>\n\n` +
          `Example: <code>/search machine learning</code>`,
        threadId,
      );
    }
    const matches = await this.prisma.course.findMany({
      where: {
        deletedAt: null,
        AND: words.map((w) => ({ title: { contains: w, mode: 'insensitive' } })),
      },
      select: { id: true, title: true, slug: true, ratingAvg: true, lecturer: { select: { name: true } } },
      take: 10,
    });
    if (matches.length === 0) {
      const html =
        `${this.brandHeader('Search')}\n\n` +
        `🔍 No results for <code>${esc(arg)}</code>.\n\n` +
        `Try fewer words, or browse <code>/courses</code>.`;
      if (editMessageId) await this.editRich(chatId, editMessageId, html);
      else await this.sendRich(chatId, html, threadId);
      return;
    }
    const links = await this.prisma.telegramCourseLink.findMany({
      where: { courseId: { in: matches.map((m) => m.id) } },
      select: { courseId: true, fileName: true, fileSizeMb: true },
    });
    const linkByCourse = new Map(links.map((l) => [l.courseId, l]));
    const deepLinkBase = `https://t.me/${BOT_USERNAME}?start=dl_`;
    const rows = matches
      .map((c, i) => {
        const l = linkByCourse.get(c.id);
        const title = l
          ? `<a href="${deepLinkBase}${c.slug}">${esc(c.title)}</a>`
          : `<b>${esc(c.title)}</b>`;
        return (
          `${i + 1}. ${title}\n` +
          `   🔑 <code>${esc(c.slug)}</code>${l ? ` · 📦 ${esc(l.fileName ?? 'file')}${l.fileSizeMb ? ` · ${l.fileSizeMb} MB` : ''}` : ' · 📭 no file yet'}` +
          (c.lecturer ? ` · 👨‍🏫 ${esc(c.lecturer.name)}` : '') +
          ` · ⭐ ${c.ratingAvg.toFixed(1)}`
        );
      })
      .join('\n\n');
    const kb: KbButton[][] = [
      [{ text: '🏠 Home', callback_data: 'home' }, { text: '❓ Help', callback_data: 'help' }],
    ];
    if (userId) {
      const nav = await this.navRowFor(userId);
      if (nav.length) kb.push(nav);
    }
    const html = `${this.brandHeader('Search Results')}\n\n${rows}\n\n${DIV}\n<i>🔍 Results for “${esc(arg)}”</i>`;
    if (editMessageId) await this.editRich(chatId, editMessageId, html, kb);
    else await this.sendRich(chatId, html, threadId, kb);
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

  /**
   * A Telegram file_id is only usable by the bot — download the image bytes
   * and mirror them to Cloudinary so the web app can serve it as a cover.
   */
  private async resolveImageUrl(raw: string, isTelegram: boolean): Promise<string> {
    if (!isTelegram) return raw; // already an http(s) URL
    try {
      const res = await this.api('getFile', { file_id: raw });
      const json = (await res.json()) as { ok: boolean; result?: { file_path?: string }; description?: string };
      if (!json.ok || !json.result?.file_path) {
        this.logger.warn(`getFile failed for cover: ${json.description ?? 'no path'}`);
        return raw;
      }
      const bytes = await fetch(`https://api.telegram.org/file/bot${this.token}/${json.result.file_path}`);
      if (!bytes.ok) return raw;
      const buffer = Buffer.from(new Uint8Array(await bytes.arrayBuffer()));
      const mime = bytes.headers.get('content-type') ?? 'image/jpeg';
      const upload = await this.cloudinary.uploadBuffer(buffer, mime, 'covers');
      return upload.url;
    } catch (err) {
      this.logger.error(`resolveImageUrl failed: ${(err as Error).message}`);
      return raw;
    }
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
  /**
   * Premium rich-text sender: parse_mode HTML + optional inline keyboard.
   * All dynamic content MUST be passed through esc() before reaching here —
   * raw <angle brackets> in user data would otherwise break the message.
   * Returns the sent message id (used by the wizard to edit in place), or null.
   */
  private async sendRich(
    chatId: number,
    html: string,
    threadId?: number | null,
    keyboard?: KbButton[][],
  ): Promise<number | null> {
    if (!this.enabled) return null;
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
      const json = (await res.json()) as { ok: boolean; description?: string; result?: { message_id?: number } };
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
        return null;
      }
      return json.result?.message_id ?? null;
    } catch (err) {
      this.logger.error(`sendRich failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Send a photo with an HTML caption + inline keyboard (course cards).
   *  Returns the message id, or null on failure (caller falls back to text). */
  private async sendPhoto(
    chatId: number,
    photoUrl: string,
    caption: string,
    keyboard?: KbButton[][],
    threadId?: number | null,
  ): Promise<number | null> {
    if (!this.enabled) return null;
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      };
      if (threadId) body.message_thread_id = threadId;
      if (keyboard && keyboard.length) body.reply_markup = { inline_keyboard: keyboard };
      const res = await this.api('sendPhoto', body);
      const json = (await res.json()) as { ok: boolean; description?: string; result?: { message_id?: number } };
      if (!json.ok) {
        this.logger.warn(`sendPhoto rejected (${chatId}): ${json.description} — url: ${photoUrl.slice(0, 120)}`);
        return null;
      }
      return json.result?.message_id ?? null;
    } catch (err) {
      this.logger.error(`sendPhoto failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Edit an existing bot message in place (Argo-style pagination). Used for
   * navigation taps so the conversation doesn't fill up with new messages.
   */
  private async editRich(chatId: number, messageId: number, html: string, keyboard?: KbButton[][]) {
    if (!this.enabled) return;
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        message_id: messageId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (keyboard && keyboard.length) body.reply_markup = { inline_keyboard: keyboard };
      const res = await this.api('editMessageText', body);
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) {
        this.logger.error(`editMessageText rejected (${chatId}/${messageId}): ${json.description}`);
        // fall back to a fresh message so navigation still works
        await this.sendRich(chatId, html, undefined, keyboard);
      }
    } catch (err) {
      this.logger.error(`editMessageText failed: ${(err as Error).message}`);
      await this.sendRich(chatId, html, undefined, keyboard);
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
