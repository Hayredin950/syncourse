/**
 * telegram-feed.parser.ts
 *
 * Pure, dependency-free parser for Telegram course channels.
 *
 * It understands two input shapes:
 *  1. Raw HTML from https://t.me/s/<channel> (public web preview) — parsed by
 *     `parseTelegramHtml`.
 *  2. Pasted message transcripts (like the "Zero To Mastery" / "AI and Machine
 *     Learning" exports) — parsed by `parsePastedText`.
 *
 * Both produce `FeedMessage[]`, which `buildFeed` groups into the app hierarchy:
 *
 *     Organization (Telegram channel)
 *        └── Course            ← one course-announcement post (🔰 / 🔅 …)
 *             ├── meta: title, description, hours → durationMin, 📦 lessons,
 *             │         ⭐️ rating, 💰 price, Taught By → Lecturer, hashtags,
 *             │         Download Full Course → sourceUrl + TelegramCourseLink
 *             └── Sections (modules)  ← grouped from the file posts that follow
 *                  └── Lessons (parts)  ← each `[ N. Module … Part 0X.zip ]`
 *                                         becomes one lesson + Attachment
 *
 * Nothing here touches the network or the database.
 */

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface FeedMessage {
  postId: string | null; // "channel/123" — t.me web preview post id
  date: Date | null;
  text: string; // plain text (HTML stripped, entities decoded)
  links: string[]; // t.me links found in the message
  fileName: string | null; // attached document name (zip/rar/7z/pdf…)
  fileList: string[]; // parts listed in a "[ N files ]" post (no extensions)
  isPoll: boolean;
  isPhoto: boolean;
}

export interface PartItem {
  fileName: string; // "8. Matplotlib … - Part 01.zip"
  moduleTitle: string; // cleaned module/section title ("8. Matplotlib …")
  partNo: number | null; // "Part 01" → 1, or null when unknown
  orderIndex: number; // chronological position inside the course
  postId: string | null;
  link: string | null; // https://t.me/<channel>/<id>
}

export interface ParsedSection {
  title: string;
  orderIndex: number;
  parts: PartItem[];
}

export interface ParsedCourse {
  title: string;
  slug: string;
  description: string;
  durationMin: number | null;
  lessonCount: number | null;
  taughtBy: string[];
  ratingAvg: number | null;
  ratingCount: number | null;
  originalPrice: number | null;
  hashtags: string[];
  links: string[];
  sourceUrl: string | null;
  announcedAt: Date | null;
  postId: string | null;
  parts: PartItem[];
  sections: ParsedSection[];
}

export interface ParsedFeed {
  channelUsername: string | null;
  channelTitle: string | null;
  subscribers: number | null;
  courses: ParsedCourse[];
  orphanParts: PartItem[]; // file posts with no preceding course announcement
  skipped: number; // polls / "winner is" / chatter
  rawCount: number;
}

// ----------------------------------------------------------------
// HTML / text helpers
// ----------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** Strip tags but keep emoji (which t.me renders as <i class="emoji"><b>😀</b></i>). */
function htmlToText(html: string): string {
  return html
    .replace(/<i class="emoji"[^>]*><b>(.*?)<\/b><\/i>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function cleanText(raw: string): string {
  return decodeEntities(htmlToText(raw))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function parseFlexDate(s: string): Date | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (m) {
    let [, mo, d, y, h, mi, ap] = m;
    let year = Number(y);
    if (year < 100) year += 2000;
    let hour = Number(h);
    if (ap) {
      if (ap.toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (ap.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const dt = new Date(year, Number(mo) - 1, Number(d), hour, Number(mi), 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const iso = new Date(t);
  return isNaN(iso.getTime()) ? null : iso;
}

// ----------------------------------------------------------------
// 1) t.me/s/<channel> HTML → FeedMessage[]
// ----------------------------------------------------------------

const MESSAGE_BLOCK_RE =
  /<div class="tgme_widget_message(?:\s+[^"]*)?"[^>]*data-post="([^"]+)"[^>]*>([\s\S]*?)(?=<div class="tgme_widget_message(?:\s|")|<\/body>)/g;

export function parseTelegramHtml(html: string): FeedMessage[] {
  const out: FeedMessage[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(MESSAGE_BLOCK_RE)) {
    const postId = m[1];
    if (seen.has(postId)) continue;
    seen.add(postId);
    const inner = m[2];

    const timeM = inner.match(/datetime="([^"]+)"/);
    const textM = inner.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    const docM = inner.match(/tgme_widget_message_document_title[^>]*>\s*([^<]+?)\s*<\/div>/);
    const links = Array.from(inner.matchAll(/href="(https:\/\/t\.me\/[^"]+)"/g), (lm) => lm[1]).filter(
      (l) => !/^https:\/\/t\.me\/[^/]+\/?$/.test(l), // drop the plain channel-home link
    );

    out.push({
      postId,
      date: timeM ? new Date(timeM[1]) : null,
      text: textM ? cleanText(textM[1]) : '',
      links: Array.from(new Set(links)),
      fileName: docM ? docM[1].trim() : null,
      fileList: [],
      isPoll: inner.includes('tgme_widget_message_poll js-poll'),
      isPhoto: inner.includes('tgme_widget_message_photo_wrap') && !textM,
    });
  }
  return out;
}

// ----------------------------------------------------------------
// 2) pasted transcript → FeedMessage[]
// ----------------------------------------------------------------

const MESSAGE_HEADER_RE = /^\[([^\]]+)\]\s+([^:]+):(?:\s*(.*))?$/ms;
const FILE_ATTACH_RE = /\[\s*([^\]]*\.(?:zip|rar|7z|tar|gz|pdf|mp4|mkv|torrent|iso))\s*\]/i;

export function parsePastedText(text: string): FeedMessage[] {
  const blocks = text.split(/\n(?=\[\d{1,2}\/\d{1,2}\/\d{2,4}\b)/);
  const out: FeedMessage[] = [];
  for (const raw of blocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const h = trimmed.match(MESSAGE_HEADER_RE);
    if (!h) continue;
    const [, dateStr, , restRaw] = h;
    const rest = (restRaw ?? '').trim();

    const fileM = rest.match(FILE_ATTACH_RE);
    const filesListM = rest.match(/\[\s*(\d{1,3})\s+files?\s*\]/i);
    const bodyRaw = rest
      .replace(FILE_ATTACH_RE, ' ')
      .replace(/\[\s*[^\]]*\s*\]/g, ' ') // "[ Photo ]", "[ Poll : … ]", "[ 9 files ]"
      .trim();

    // "[ 9 files ]" posts list the part names as numbered lines in the body
    let fileList: string[] = [];
    if (filesListM) {
      fileList = bodyRaw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\d{1,3}\.?\s+\S/.test(l) && !/^(🌀|📱|📤|📌|Download)/.test(l))
        .map((l) => l.replace(/^(\d{1,3})\.?\s+/, (m) => m));
    }

    out.push({
      postId: null,
      date: parseFlexDate(dateStr),
      text: filesListM ? '' : cleanText(bodyRaw),
      links: Array.from(restRaw.matchAll(/https?:\/\/t\.me\/[^\s\]]+/g), (lm) => lm[0].replace(/[),.;]+$/, '')),
      fileName: fileM ? fileM[1] : null,
      fileList,
      isPoll: /\[ *Poll *[: ]/i.test(rest),
      isPhoto: /\[ *Photo *\]/.test(rest),
    });
  }
  return out;
}


// ----------------------------------------------------------------
// 3) course-announcement detection
// ----------------------------------------------------------------

const TITLE_EMOJI_RE = /^(?:🔰|🔅|📕|⭐️|🌟|🧿|🔆|💡|🌐|📚|💎)/;
const HOURS_RE = /(?:⏱️?|⏱|⏲|⏰|⏳)\s*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)\b/i;
const HOURS_PLAIN_RE = /\b(\d+(?:\.\d+)?)\s*(?:Hours|hrs)\b/i;
const LESSONS_RE = /📦\s*(\d[\d,]*)/i;
const LESSONS_PLAIN_RE = /\b(\d[\d,]*)\s*(?:Lessons|lessons)\b/i;
const TAUGHT_BY_RE = /(?:Taught By|Taught by|Author|Instructor)\s*:?\s*([^\n]+)/i;
const RATING_RE = /🌟\s*([\d.]+)\s*-\s*([\d,]+)\s*votes/i;
const PRICE_RE = /(?:Original Price|Price)\s*:?\s*\$?\s*([\d.]+)/i;

export function looksLikeCoursePost(msg: FeedMessage): ParsedCourse | null {
  const text = (msg.text ?? '').trim();
  if (!text) return null;

  const hasDownload = /\bDownload (Full |The )?Courses?/i.test(text);
  const hasTaught = TAUGHT_BY_RE.test(text);
  const hasHours = HOURS_RE.test(text) || HOURS_PLAIN_RE.test(text);
  const hasLessons = LESSONS_RE.test(text) || LESSONS_PLAIN_RE.test(text);
  const hasPrice = PRICE_RE.test(text) || /\$\s?\d/.test(text);

  const isCourse = hasDownload || hasTaught || (hasLessons && (hasHours || hasPrice));
  if (!isCourse) return null;

  const lines = text.split('\n');
  let titleLine = lines.find((l) => l.length > 4 && TITLE_EMOJI_RE.test(l));
  if (!titleLine) titleLine = lines.find((l) => l.length > 6 && !/^(Download|Taught|🌟|💰|⏱|⏲|⏰|📦|#)/.test(l));
  let title = (titleLine ?? lines[0] ?? 'Untitled course')
    .replace(TITLE_EMOJI_RE, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .trim();
  // strip a trailing vote counter suffix like "4.5 - 8341 votes"
  title = title.replace(/\s*[—-]\s*\d+(?:\.\d+)?\s*-\s*[\d,]+\s*votes?\s*$/i, '').trim();
  if (!title) title = 'Untitled course';

  const taughtBy = (text.match(TAUGHT_BY_RE)?.[1] ?? '')
    .split(/&|,|\//)
    .map((n) => n.replace(/[🎙👩‍🚀👨‍🚀]+/g, '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const hoursM = text.match(HOURS_RE) ?? text.match(HOURS_PLAIN_RE);
  const lessonsM = text.match(LESSONS_RE) ?? text.match(LESSONS_PLAIN_RE);
  const ratingM = text.match(RATING_RE);
  const priceM = text.match(PRICE_RE);



  const metaPrefixes = /^(🌟|💰|⏱|⏲|⏰|⏳|📦|📖|📔|🎙|🔊|🔗|🗓|📁)/;
  const description = lines
    .filter((l) => {
      const s = l.trim();
      if (!s) return false;
      if (s === titleLine?.trim()) return false;
      if (metaPrefixes.test(s)) return false;
      if (/^(Download|Taught|🌟|💰|⏱|⏲|⏰|📦|#)/.test(s)) return false;
      if (/^🔰|^🔅/.test(s)) return false;
      return true;
    })
    .join(' ')
    .slice(0, 900);

  const hashtags = Array.from(text.matchAll(/#(\w[\w-]*)/g), (hm) => hm[1]);
  const sourceUrl = msg.links[0] ?? null;

  return {
    title,
    slug: slugify(title),
    description,
    durationMin: hoursM ? Math.round(Number(hoursM[1]) * 60) : null,
    lessonCount: lessonsM ? Number(lessonsM[1].replace(/,/g, '')) : null,
    taughtBy,
    ratingAvg: ratingM ? Number(ratingM[1]) : null,
    ratingCount: ratingM ? Number(ratingM[2].replace(/,/g, '')) : null,
    originalPrice: priceM ? Number(priceM[1]) : null,
    hashtags,
    links: msg.links,
    sourceUrl,
    announcedAt: msg.date,
    postId: msg.postId,
    parts: [],
    sections: [],
  };
}

// ----------------------------------------------------------------
// 4) file posts → part items, grouped into sections (modules)
// ----------------------------------------------------------------

function stripExt(name: string): string {
  return name.replace(/\.(zip|rar|7z|tar|gz|pdf|mp4|mkv|torrent|iso)$/i, '');
}

function cleanModuleTitle(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/[ \t]*[-–—_]+[ \t]*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .trim();
}

/** "8. Matplotlib Plotting and Data Visualization - Part 01.zip" → module + part. */
export function partFromFile(fileName: string, orderIndex: number, postId: string | null, link: string | null): PartItem {
  const base = stripExt(fileName);
  const idxM = base.match(/^(\d{1,3})[.\-_ ]+(.+)$/);
  let rest = idxM ? idxM[2] : base;
  let partNo: number | null = null;

  const partM = rest.match(/(?:[-–—_]|\s)\s*[Pp]art\s*(\d{1,3})\s*$/);
  if (partM) {
    partNo = Number(partM[1]);
    rest = rest.replace(/(?:[-–—_]|\s)\s*[Pp]art\s*(\d{1,3})\s*$/, '');
  }
  const prefix = idxM ? `${idxM[1]}. ` : '';
  const moduleTitle = cleanModuleTitle(prefix + rest) || cleanModuleTitle(base) || stripExt(fileName);

  return { fileName, moduleTitle, partNo, orderIndex, postId, link };
}

/** Group the flat parts of one course into ordered sections (modules). */
export function organizeParts(parts: PartItem[]): ParsedSection[] {
  const map = new Map<string, PartItem[]>();
  for (const p of parts) {
    const key = p.moduleTitle.toLowerCase();
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  const sections: ParsedSection[] = [];
  let i = 0;
  for (const list of map.values()) {
    sections.push({ title: list[0].moduleTitle, orderIndex: i++, parts: list });
  }
  return sections;
}

// ----------------------------------------------------------------
// 5) message stream → course tree
// ----------------------------------------------------------------

export function buildFeed(
  messages: FeedMessage[],
  opts: { channelUsername?: string | null; channelTitle?: string | null; subscribers?: number | null } = {},
): ParsedFeed {
  // The t.me web preview is newest-first; pasted transcripts are oldest-first.
  // Sort chronologically so "announcement → its file posts" grouping is stable.
  const ordered = [...messages].sort((a, b) => {
    if (a.date && b.date) return a.date.getTime() - b.date.getTime();
    return 0;
  });

  const courses: ParsedCourse[] = [];
  const orphanParts: PartItem[] = [];
  let skipped = 0;
  let current: ParsedCourse | null = null;
  let msgIndex = 0;

  for (const msg of ordered) {
    msgIndex++;
    if (msg.isPoll || /(winner is|vote for the next course|Final Results|closes? this vote|download and watch)/i.test(msg.text)) {
      skipped++;
      continue;
    }
    const course = looksLikeCoursePost(msg);
    if (course) {
      if (current) {
        current.sections = organizeParts(current.parts);
        courses.push(current);
      }
      current = course;
      continue;
    }
    if (msg.fileList.length > 0) {
      for (const name of msg.fileList) {
        msgIndex++;
        const part = partFromFile(name, msgIndex, msg.postId, msg.links[0] ?? null);
        if (current) current.parts.push(part);
        else orphanParts.push(part);
      }
      continue;
    }
    if (msg.fileName) {
      const part = partFromFile(msg.fileName, msgIndex, msg.postId, msg.links[0] ?? null);
      if (current) current.parts.push(part);
      else orphanParts.push(part);
      continue;
    }
    skipped++;
  }
  if (current) {
    current.sections = organizeParts(current.parts);
    courses.push(current);
  }

  return {
    channelUsername: opts.channelUsername ?? null,
    channelTitle: opts.channelTitle ?? null,
    subscribers: opts.subscribers ?? null,
    courses,
    orphanParts,
    skipped,
    rawCount: messages.length,
  };
}

