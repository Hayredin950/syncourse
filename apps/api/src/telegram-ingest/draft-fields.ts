/**
 * draft-fields.ts
 *
 * The small amount of structure the group post does not already carry.
 *
 * The watcher reads a normal announcement (title, "Taught By", hours, price,
 * hashtags) with `parseAnnouncement`, and the ZIPs that follow attach to it.
 * What it cannot read from that template is editorial intent: which photo is
 * the cover, whose face is the lecturer, which organisation published it, and
 * whether this post is a course at all. Those are expressed with plain lines
 * (`org: Udemy`) or a one-word photo caption (`lecturer`), never with a
 * start/end ceremony.
 *
 * Everything here is pure so the rules can be tested without a database and
 * explained to an operator line by line.
 */
import type { DraftImage, DraftImageRole, DraftPayload } from './draft-parser';
import { cleanTitlePointers } from './telegram-feed.parser';

/** Every key a post may set explicitly. Aliases map to one canonical name. */
export type DraftFieldKey =
  | 'title'
  | 'description'
  | 'lecturerNames'
  | 'lecturerBio'
  | 'organizationName'
  | 'organizationType'
  | 'organizationDescription'
  | 'categorySlugs'
  | 'levelName'
  | 'contentType'
  | 'price'
  | 'originalPrice'
  | 'tags'
  | 'language'
  | 'isPremium'
  | 'resourceType'
  | 'resourceSummary'
  | 'sourceUrl'
  | 'coverUrl';

export interface ExtractedFields {
  values: Partial<Record<DraftFieldKey, string>>;
  /** The announcement with the field lines removed, so title/price parsing sees prose only. */
  cleaned: string;
}

const ALIASES: Record<string, DraftFieldKey> = {
  title: 'title',
  name: 'title',
  description: 'description',
  desc: 'description',
  about: 'description',
  lecturer: 'lecturerNames',
  lecturers: 'lecturerNames',
  instructor: 'lecturerNames',
  instructors: 'lecturerNames',
  teacher: 'lecturerNames',
  author: 'lecturerNames',
  // "Taught By:" is deliberately absent: `parseAnnouncement` already owns it
  // and a second reader would only disagree with the first.
  'lecturer-bio': 'lecturerBio',
  'instructor-bio': 'lecturerBio',
  bio: 'lecturerBio',
  org: 'organizationName',
  organisation: 'organizationName',
  organization: 'organizationName',
  publisher: 'organizationName',
  'org-name': 'organizationName',
  'org-type': 'organizationType',
  'organisation-type': 'organizationType',
  'organization-type': 'organizationType',
  'org-description': 'organizationDescription',
  'organisation-description': 'organizationDescription',
  'organization-description': 'organizationDescription',
  category: 'categorySlugs',
  categories: 'categorySlugs',
  level: 'levelName',
  type: 'contentType',
  kind: 'contentType',
  'content-type': 'contentType',
  price: 'price',
  'original-price': 'originalPrice',
  originalprice: 'originalPrice',
  'old-price': 'originalPrice',
  tags: 'tags',
  hashtags: 'tags',
  language: 'language',
  lang: 'language',
  premium: 'isPremium',
  resource: 'resourceType',
  'resource-type': 'resourceType',
  'resource-kind': 'resourceType',
  summary: 'resourceSummary',
  source: 'sourceUrl',
  'source-url': 'sourceUrl',
  cover: 'coverUrl',
  thumbnail: 'coverUrl',
  image: 'coverUrl',
};

/**
 * Keys whose value may continue on the following lines when written as a bare
 * marker (`#description` on its own line). A long body is the one field people
 * actually want to write in paragraphs.
 */
const MULTILINE: DraftFieldKey[] = ['description', 'resourceSummary', 'lecturerBio', 'organizationDescription'];

const CANONICAL = new Set<string>(Object.values(ALIASES));

function keyOf(raw: string): DraftFieldKey | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return ALIASES[key] ?? null;
}

/** `#org: Udemy`, `org = Udemy`, `- Category: Design` — same thing. */
const VALUE_LINE = /^\s*[#*\-•]?\s*([A-Za-z][A-Za-z -]{1,30}?)\s*[:=]\s*(.+)$/;
/** `#org Udemy` — a hash marker with the value after a space. */
const HASH_VALUE = /^\s*#\s*([A-Za-z][A-Za-z-]{1,30})\s+(.+)$/;
/** A marker with no value on its own line: `#description`. */
const BARE_LINE = /^\s*[#*\-•]?\s*([A-Za-z][A-Za-z-]{1,30})\s*$/;

/** The canonical key a line starts with, or null when the line is prose. */
function keyedLine(line: string): DraftFieldKey | null {
  const valued = line.match(VALUE_LINE);
  if (valued) {
    const key = keyOf(valued[1]);
    if (key) return key;
  }
  const hashed = line.match(HASH_VALUE);
  if (hashed) {
    const key = keyOf(hashed[1]);
    if (key) return key;
  }
  const bare = line.match(BARE_LINE);
  if (bare) {
    const key = keyOf(bare[1]);
    if (key) return key;
  }
  return null;
}

/**
 * Pull the explicit field lines out of a post and leave the prose behind.
 * A line that is not a known key is prose and stays in `cleaned`.
 */
export function extractFields(text: string): ExtractedFields {
  const lines = text.split(/\r?\n/);
  const values: ExtractedFields['values'] = {};
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const valued = line.match(VALUE_LINE);
    if (valued) {
      const key = keyOf(valued[1]);
      if (key) {
        values[key] = appendValue(values[key], valued[2].trim());
        continue;
      }
    }

    const hashed = line.match(HASH_VALUE);
    if (hashed) {
      const key = keyOf(hashed[1]);
      if (key) {
        values[key] = appendValue(values[key], hashed[2].trim());
        continue;
      }
    }

    const bare = line.match(BARE_LINE);
    if (bare) {
      const key = keyOf(bare[1]);
      if (key) {
        if (MULTILINE.includes(key)) {
          const body: string[] = [];
          while (i + 1 < lines.length && !keyedLine(lines[i + 1])) {
            body.push(lines[i + 1]);
            i++;
          }
          const joined = body.join('\n').trim();
          if (joined) values[key] = appendValue(values[key], joined);
        }
        // A bare non-multiline key is noise ("#category" with nothing after it).
        continue;
      }
    }

    kept.push(line);
  }

  return { values, cleaned: kept.join('\n').trim() };
}

function appendValue(previous: string | undefined, next: string): string {
  if (!previous) return next;
  return `${previous}, ${next}`;
}

/**
 * Which photo is this? An explicit caption wins. A photo whose caption is a
 * whole announcement is the cover of that announcement — checking for role
 * words first would tag it `lecturer` just because the body says "Taught By".
 * After the cover, uncaptioned photos are gallery frames rather than noise.
 */
export function mediaRole(
  caption: string | null,
  existing: DraftImage[],
  opts: { announcement?: boolean } = {},
): DraftImageRole | null {
  const text = (caption ?? '').trim().toLowerCase();
  const has = (role: DraftImageRole) => existing.some((i) => i.role === role);

  if (opts.announcement) return has('cover') ? 'gallery' : 'cover';

  if (/^\s*(cover|thumbnail|poster|banner)\s*$/i.test(text)) return 'cover';
  if (/^\s*(lecturer|instructor|teacher)\s*(?:photo|image)?\s*$/i.test(text)) return 'lecturer';
  if (/^\s*(org|organisation|organization|publisher|university|company|logo)\s*(?:logo|photo|image)?\s*$/i.test(text)) {
    return 'organization';
  }

  // `org: Udemy` and `lecturer: Stephen Grider` are both a role and a name.
  if (/^\s*(org|organisation|organization|publisher)\s*[:=]/.test(text)) return 'organization';
  if (/^\s*(lecturer|instructor|teacher)\s*[:=]/.test(text)) return 'lecturer';

  if (!text) return has('cover') ? 'gallery' : 'cover';
  return null;
}

/** The name typed next to a role caption, if any (`lecturer: Stephen Grider`). */
export function mediaName(caption: string | null): string | null {
  const m = (caption ?? '').match(/\b(?:lecturer|instructor|teacher)\s*[:=]\s*(.+)$/i);
  if (m) return m[1].trim().slice(0, 120) || null;
  const org = (caption ?? '').match(/\b(?:org|organisation|organization|publisher)\s*[:=]\s*(.+)$/i);
  return org ? org[1].trim().slice(0, 120) || null : null;
}

// ---------------------------------------------------------------------------
// Reading a normal post
// ---------------------------------------------------------------------------

/**
 * Lines that are distribution boilerplate, not the post. In this group every
 * course ends with `📤 Download Full Course  📤 Download All Courses` and every
 * syndicated post ends with `🔗 Join … for more courses`; both used to end up in
 * the description and one even became the course title.
 */
function isNoiseLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^\s*[📤📥]\s*.*\b(?:Download (?:Full|All|The)?\s*Courses?|Full Course|All Courses|for more courses)\b/i.test(s)) {
    return true;
  }
  if (/\bDownload (?:Full|All|The)\s*Courses?\b/i.test(s)) return true;
  if (/^\s*[📤📥]\s*Download\s*$/i.test(s)) return true;
  if (/^\s*(?:(?:🔗|🌐|📤|📥)\s*)?(?:Join|Follow)\b.*\bfor more (?:courses|content|updates)\b/i.test(s)) {
    return true;
  }
  // Forward headers such as `📱Artificial intelligence` above a ZIP name.
  if (/^\s*📱\s*\S/.test(s)) return true;
  // Divider rules (`━━━━━━━━`), not meaningful prose.
  if (/^[━─—=_*~·•]{4,}$/u.test(s)) return true;
  // A line of hashtags only is metadata, not the body.
  if (/^(?:#[\w-]+\s*)+$/.test(s)) return true;
  return false;
}

/** The post with distribution boilerplate removed; everything else untouched. */
export function stripPromo(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `🔰 Title` / `📕 Book` / `**Title**` → `Title`, safe to store as a title. */
export function cleanPostTitle(raw: string): string {
  const pointed = cleanTitlePointers(raw);
  const hasFire = /🔥\uFE0F?$/u.test(pointed);
  const bare = pointed
    .replace(/^[\s>*_#•\-–—]+/u, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    // A decorative emoji at the end (`… SHOULD KNOW 🧠`) is not the title.
    // The fire is the one exception: it is the app's course marker.
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+$/gu, '')
    .replace(/[\s:;,–—-]+$/u, '')
    .trim()
    .slice(0, hasFire ? 199 : 200);
  return hasFire && !/🔥$/u.test(bare) ? `${bare} 🔥` : bare;
}

/**
 * A heading that classifies the files below it: "⚡️The Ultimate Design
 * Patterns: Part 1", "Part 2 of 3", "Part III". It is a one-line label, not a
 * description, so a paragraph that merely mentions a part does not match.
 */
const PART_HEADING_RE =
  /^[^\p{L}\p{N}]*[^\n]{0,140}?\bpart[\s-]*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[ivx]{1,4})\b(?:\s*(?:of|\/)\s*\d+)?\s*[:.!–—-]?\s*$/iu;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
};

/** `⚡️… : Part 1` → `{ label: 'Part 1', title: 'The Ultimate Design Patterns' }`. */
export function partHeading(text: string): { label: string; title: string } | null {
  const cleaned = stripPromo((text ?? '').replace(/\r/g, '')).trim();
  if (!cleaned || cleaned.length > 160) return null;
  // A ZIP, a link or a multi-line body is a real post, not a section marker.
  if (/\.(?:zip|rar|7z|pdf|epub)\b/i.test(cleaned)) return null;
  if (/https?:\/\//i.test(cleaned)) return null;
  const line = cleaned.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  if (!line) return null;
  const m = line.match(PART_HEADING_RE);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const num = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  if (!num || num < 1 || num > 99) return null;
  const title = line
    .replace(/\s*[—–-]?\s*\bpart[\s-]*\S+\s*$/i, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:;,–—-]+$/u, '')
    .trim();
  return { label: `Part ${num}`, title };
}

const DESCRIPTION_PREFIX = /^(?:📖|📝|📔|📄)\s*/;
const META_LINE =
  /^(?:🌟|⭐️?|💰|💳|⏱️?|⏱|⏲|⏰|⏳|📦|🎙|🔊|🔰|🔅|🌐\s*(?:Author|Website|Level|Duration)|📋\s*Topics?|#|Download\b|Taught By\b|Author\s*:|Instructor\s*:|Level\s*:|Duration\s*:)/i;

/**
 * The body a course should show. The new `🔅` template puts it on a `📝` line
 * and the `🔰` template on a `📖` line; older posts just write a paragraph.
 * The shared feed parser drops every `📖` line as metadata, so the watcher
 * reads the description itself instead of publishing an empty page.
 */
export function describeAnnouncement(text: string, title?: string): string {
  const lines = stripPromo(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const explicit = lines
    .map((l) => (DESCRIPTION_PREFIX.test(l) ? l.replace(DESCRIPTION_PREFIX, '').trim() : null))
    .filter((v): v is string => Boolean(v));
  if (explicit.length > 0) return explicit.join('\n').slice(0, 1_200).trim();

  const cleanTitle = title ? cleanPostTitle(title).toLowerCase() : '';
  const prose = lines.filter((line) => {
    if (META_LINE.test(line)) return false;
    const bare = cleanPostTitle(line).toLowerCase();
    if (!bare) return false;
    if (cleanTitle && bare === cleanTitle) return false;
    return true;
  });
  return prose.join('\n').slice(0, 1_200).trim();
}

/** First meaningful line of a normal post, minus its emoji. */
export function titleFromPost(text: string): string {
  const line = stripPromo(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => cleanPostTitle(l).length > 0);
  return line ? cleanPostTitle(line) : '';
}

/** Everything after the title line, with boilerplate already removed. */
export function bodyFromPost(text: string, title = titleFromPost(text)): string {
  const lines = stripPromo(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0];
  if (!first) return '';
  const cleanFirst = cleanPostTitle(first);
  const startsWithTitle =
    cleanFirst === title || cleanFirst.startsWith(title) || title.startsWith(cleanFirst);
  return (startsWithTitle ? lines.slice(1) : lines).join('\n').trim().slice(0, 12_000);
}

export interface StandaloneResource {
  title: string;
  body: string;
  resourceType: 'roadmap' | 'note' | 'cheat-sheet';
  confidence: number;
  signals: string[];
  /** No caption: a placeholder title was used and must be corrected. */
  needsTitle: boolean;
}

const CHATTER =
  /^(?:hi|hello|hey|yo|thanks|thank you|ok|okay|sure|test|testing|resources?|nice|cool|good|great|lol|wow|yes|no)\b/i;

/**
 * A post that is not a course template — a photo, album, video, book, note or
 * roadmap — becomes a Resource. Rules, not a model: a picture with a title is
 * enough, a text-only post needs real body, and obvious chatter is ignored.
 */
export function classifyStandalone(input: {
  text: string | null;
  hasImage: boolean;
  /** Video, audio, PDF, epub and similar (never an archive). */
  hasMediaFile: boolean;
  hasArchive: boolean;
  fileName?: string | null;
  date?: Date;
}): StandaloneResource | null {
  const raw = stripPromo((input.text ?? '').replace(/\r/g, ''));
  if (raw.startsWith('/')) return null;

  const title = titleFromPost(raw);
  const body = bodyFromPost(raw, title);
  const alnum = title.replace(/[^a-z0-9]/gi, '').length;

  // A file with no caption can still be a book or a video post. Its filename
  // is the only title we have, and it is better than losing the upload.
  if (!raw && input.fileName && input.hasMediaFile) {
    const fromFile = cleanPostTitle(input.fileName.replace(/\.[a-z0-9]{2,5}$/i, ''));
    if (fromFile.replace(/[^a-z0-9]/gi, '').length >= 3) {
      return {
        title: fromFile,
        body: '',
        resourceType: 'note',
        confidence: 0.8,
        signals: ['standalone', 'media', 'title-from-filename'],
        needsTitle: false,
      };
    }
  }

  // A photo/album can have no caption at all; keep it with a placeholder and
  // let the operator name it, rather than dropping the picture on the floor.
  if (!raw) {
    if (!input.hasImage) return null;
    const day = (input.date ?? new Date()).toISOString().slice(0, 10);
    return {
      title: `Photo post · ${day}`,
      body: '',
      resourceType: 'cheat-sheet',
      confidence: 0.4,
      signals: ['photo-only', 'needs-title'],
      needsTitle: true,
    };
  }

  if (title.length === 0 || alnum < 3) {
    // A lone emoji or one-word greeting is not a post.
    if (!input.hasImage && !input.hasMediaFile) return null;
    if (CHATTER.test(raw) && raw.length < 40) return null;
  }

  // Text-only posts need substance: a hello or "resources" is not a note.
  if (!input.hasImage && !input.hasMediaFile) {
    if (input.hasArchive) return null;
    if (raw.length < 120 && body.length < 40) return null;
    if (CHATTER.test(raw) && raw.length < 200) return null;
  }

  // A ZIP with no post around it is an orphan part, not a resource.
  if (input.hasArchive && !input.hasImage && !input.hasMediaFile) return null;

  if (CHATTER.test(raw) && raw.length < 60 && !input.hasImage) return null;

  let finalTitle = title;
  let needsTitle = false;
  if (!finalTitle || alnum < 3) {
    const fromFile = input.fileName ? cleanPostTitle(input.fileName.replace(/\.[a-z0-9]{2,5}$/i, '')) : '';
    if (fromFile && fromFile.replace(/[^a-z0-9]/gi, '').length >= 3) {
      finalTitle = fromFile;
    } else if (input.hasImage) {
      const day = (input.date ?? new Date()).toISOString().slice(0, 10);
      finalTitle = `Photo post · ${day}`;
      needsTitle = true;
    } else {
      return null;
    }
  }

  const complete = raw.length >= 120 || body.length >= 40 || input.hasMediaFile;
  const resourceType = resourceTypeFrom(raw, complete, input.hasImage);
  const signals = ['standalone', `resource:${resourceType}`];
  if (input.hasImage) signals.push('image');
  if (input.hasMediaFile) signals.push('media');
  if (needsTitle) signals.push('needs-title');
  if (body.length >= 40) signals.push('body');

  // A generic long paragraph can be a note or a chat message. A post with a
  // clear format word, or with a picture/video behind it, is trusted.
  const explicit = /(?:roadmap|cheat[- ]?sheet|notes?|guide|terms|glossary|summary|reference|handbook|books?)\b/i.test(raw);
  const confidence = explicit || input.hasImage || input.hasMediaFile ? 0.85 : 0.55;

  return { title: finalTitle, body, resourceType, confidence, signals, needsTitle };
}

function resourceTypeFrom(text: string, complete: boolean, hasImage: boolean): 'roadmap' | 'note' | 'cheat-sheet' {
  if (/\b(roadmap|learning path|learning-path|step[- ]by[- ]step|path to|steps? to)\b/i.test(text)) return 'roadmap';
  if (/\b(cheat[- ]?sheet|cheatsheet|quick reference|reference guide|glossary|cheat)\b/i.test(text)) return 'cheat-sheet';
  if (/\b(notes?|summary|handbook|books?|guide)\b/i.test(text) && !/\b(pillars?|layers?|algorithms?)\b/i.test(text)) return 'note';
  // A picture with a short caption is a visual cheat-sheet; a long text post
  // with no picture is a note.
  if (hasImage && text.length < 600) return 'cheat-sheet';
  return complete ? 'note' : 'cheat-sheet';
}

/**
 * Real prose, ignoring hashtags, links and emoji. A social caption that is
 * only a title, a link and a hashtag is not a resource body; when module ZIPs
 * follow such a post, it is a course.
 */
export function hasMeaningfulProse(text: string | null | undefined): boolean {
  const cleaned = (text ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#[\p{L}\p{N}_-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 40;
}

/**
 * A short course that carries a duration but no lesson count is a mini-course
 * by the catalogue's own definition. The explicit `type:` line always wins.
 */
export function courseKindFrom(input: {
  text: string;
  title: string;
  durationMin: number | null;
  lessonCount: number | null;
  fileCount?: number | null;
  declared?: string | null;
}): 'course' | 'mini-course' {
  const declared = (input.declared ?? '').toLowerCase();
  if (declared === 'mini-course') return 'mini-course';
  if (declared === 'course') return 'course';
  const haystack = `${input.title}\n${input.text}`;
  if (/\bmini[- ]?course\b|\bcrash course\b|\bquick course\b/i.test(haystack)) return 'mini-course';
  // A long course is a course even when it ships as one archive.
  if (input.durationMin !== null && input.durationMin > 90) return 'course';
  if (input.lessonCount !== null && input.lessonCount > 12) return 'course';
  if (input.durationMin !== null && input.durationMin > 0) return 'mini-course';
  if (input.lessonCount !== null && input.lessonCount > 0) return 'mini-course';
  // A post that calls itself a course/bootcamp/masterclass is a full course,
  // however few ZIPs it happens to arrive in.
  if (/\b(?:course|bootcamp|masterclass)\b/i.test(input.title)) return 'course';
  // The group's shorter uploads are a small number of ZIPs. One to three
  // archives is a mini-course; more than that is a full curriculum.
  if (input.fileCount !== undefined && input.fileCount !== null && input.fileCount > 0 && input.fileCount <= 3) {
    return 'mini-course';
  }
  return 'course';
}

/** The first non-Telegram link on a post (O'Reilly, GitHub, a paper). */
export function externalLink(text: string): string | null {
  const links = Array.from(stripPromo(text).matchAll(/https?:\/\/[^\s<>()]+/g), (m) => m[0].replace(/[),.;]+$/, ''));
  return links.find((l) => !/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(l)) ?? null;
}

/** `resource:` / `kind: roadmap` turns the post into a Resource, not a Course. */
export function resourceTypeOf(values: ExtractedFields['values'], text: string): string | null {
  const declared = (values.resourceType ?? '').trim().toLowerCase();
  if (declared) {
    if (['roadmap', 'path', 'learning-path'].includes(declared)) return 'roadmap';
    if (['note', 'notes'].includes(declared)) return 'note';
    return 'cheat-sheet';
  }
  // `type: roadmap` on a normal post is also a resource.
  const contentType = (values.contentType ?? '').trim().toLowerCase();
  if (['roadmap', 'cheat-sheet', 'cheatsheet', 'note', 'notes'].includes(contentType)) {
    return contentType === 'roadmap' ? 'roadmap' : contentType.startsWith('note') ? 'note' : 'cheat-sheet';
  }
  // A post that opens with "resource:" is the short form: `resource: Figma shortcuts`.
  if (/^\s*resource\s*:/i.test(text)) return 'cheat-sheet';
  return null;
}

/**
 * A resource post has no "Taught By"/price template to parse. Its first
 * meaningful line is the title and the rest is the body, with the explicit
 * `title:` / `description:` lines winning when present.
 */
export function parseResourcePost(
  text: string,
  values: ExtractedFields['values'],
  markerTitle?: string,
): { title: string; body: string } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const explicit = (values.title ?? '').trim();
  const withoutMarker = lines.map((l) => l.replace(/^resource\s*:\s*/i, '').trim()).filter(Boolean);
  const firstLineTitle = withoutMarker[0] ?? '';
  const title = explicit || (markerTitle ?? '').trim() || firstLineTitle;
  if (title.replace(/[^a-z0-9]/gi, '').length < 3) return null;

  // Only drop the first line when that line *is* the title. A `resource:`
  // marker or a `title:` line has already been removed by `extractFields`, so
  // the remaining lines are all body.
  const bodyLines = explicit || (markerTitle ?? '').trim() ? withoutMarker : withoutMarker.slice(1);
  const body = (values.description ?? '').trim() || bodyLines.join('\n').slice(0, 8_000);

  return { title: title.slice(0, 200), body };
}

/**
 * Should this publish itself? Only when the post carries everything a reader
 * needs and the parser is confident. A missing description is the usual reason
 * a draft waits — publishing a course with an empty page is worse than one
 * extra tap.
 */
export function autoPublishBlockers(payload: DraftPayload): string[] {
  const blockers: string[] = [];
  const a = payload.announcement;
  const f = payload.fields ?? {};
  const kind = payload.kind ?? 'course';
  const signals = payload.signals ?? [];

  if (!(f.title ?? a.title)?.trim() || signals.includes('needs-title')) blockers.push('title');
  if (signals.includes('course-exists')) blockers.push('already-exists');
  if ((payload.confidence ?? 0) < 0.7) blockers.push('low-confidence');

  if (kind === 'resource') {
    const body = (f.description ?? f.resourceSummary ?? a.description ?? '').trim();
    const images = (payload.images ?? []).length;
    const files = (payload.files ?? []).length;
    if (body.length < 60 && files === 0 && images === 0) blockers.push('body');
    return blockers;
  }

  // A title + image post that later received module ZIPs is a course without
  // the full announcement template. Its files are the product; requiring a
  // biography would leave a perfectly usable course in the queue forever.
  const simple = signals.includes('simple-course');
  if (!simple) {
    if ((f.lecturerNames ?? a.lecturerNames ?? []).filter(Boolean).length === 0) blockers.push('lecturer');
    const description = (f.description ?? a.description ?? '').trim();
    if (description.length < 80) blockers.push('description');
  }
  if ((payload.files?.length ?? 0) === 0) blockers.push('files');
  return blockers;
}
