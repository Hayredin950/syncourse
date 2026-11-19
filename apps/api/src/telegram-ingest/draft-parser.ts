/**
 * draft-parser.ts
 *
 * Rule-based understanding of one Telegram group message. No AI, no network:
 * every decision here is something an operator could explain.
 *
 * The group posts a course as a template — an emoji title, "Taught By", hours,
 * lessons, price, hashtags, "Download Full Course" — followed by one ZIP per
 * module part. `looksLikeCoursePost` (already used by the feed importer) reads
 * the announcement; this file adds what the watcher needs on top:
 *
 *   • a confidence score and the signals behind it, so an admin knows why a
 *     post was proposed;
 *   • a module title and part number derived from each ZIP's filename;
 *   • category slugs chosen from the real catalogue, not invented ones.
 *
 * Everything is pure so it can be tested without a database.
 */
import { FeedMessage, ParsedCourse, looksLikeCoursePost, partFromFile, slugify } from './telegram-feed.parser';

export interface DraftFile {
  messageId: number;
  fileId: string;
  fileName: string;
  fileSizeMb: number | null;
  mimeType: string | null;
  moduleTitle: string | null;
  partIndex: number;
  addedAt: string;
  /** Telegram's album id, so an out-of-order album can still form one post. */
  mediaGroupId?: string | null;
}

export interface DraftAnnouncement {
  title: string;
  slug: string;
  description: string;
  lecturerNames: string[];
  durationMin: number | null;
  lessonCount: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  originalPrice: number | null;
  hashtags: string[];
  sourceUrl: string | null;
  postedAt: string | null;
}

/**
 * A photo posted with the course: the cover, the lecturer's face, a logo, or
 * one frame of a gallery (albums and image-only resource posts). Galleries are
 * kept whole so a photo post does not lose every picture after the first.
 */
export type DraftImageRole = 'cover' | 'lecturer' | 'organization' | 'gallery';

export interface DraftImage {
  role: DraftImageRole;
  fileId: string;
  messageId: number;
  caption: string | null;
  /** For `lecturer` / `organization` captions that named the person or org. */
  name?: string | null;
  /** Telegram's album id; lets an out-of-order album rebuild one post. */
  mediaGroupId?: string | null;
}

/**
 * Fields the operator wrote explicitly (`org: Udemy`, `level: Advanced`).
 * Absent means "use what the announcement parser guessed".
 */
export interface DraftFields {
  title?: string;
  description?: string;
  lecturerNames?: string[];
  lecturerBio?: string;
  organizationName?: string;
  organizationType?: string;
  organizationDescription?: string;
  /** Slugs or human names; resolved (and created when new) at approval time. */
  categorySlugs?: string[];
  levelName?: string;
  contentType?: string;
  /** `null` means free; `undefined` means "not stated". */
  price?: number | null;
  originalPrice?: number | null;
  tags?: string[];
  language?: string;
  isPremium?: boolean;
  resourceType?: string;
  resourceSummary?: string;
  sourceUrl?: string;
  coverUrl?: string;
}

export interface DraftPayload {
  version: 1;
  /** A post is a course unless it says `resource:`. */
  kind?: 'course' | 'resource';
  announcement: DraftAnnouncement;
  chat: { id: number; username: string | null; title: string | null };
  topic: { id: number | null; name: string | null };
  author: { id: number | null; username: string | null; firstName: string | null };
  files: DraftFile[];
  /** Photos carried by the post, with the role their caption gave them. */
  images?: DraftImage[];
  /** Explicit overrides typed in the post. */
  fields?: DraftFields;
  /** Existing `Category.slug` values, resolved again at approval time. */
  categorySlugs: string[];
  /** 0–1, from the signals below. Never presented as a guarantee. */
  confidence: number;
  signals: string[];
  /** Message id of the bot's own review card, so it can be edited in place. */
  cardMessageId: number | null;
  /** Set on approval, so the console can link straight to the course. */
  approvedCourseSlug?: string;
  /** Approved without a human tap because every required field was present. */
  autoPublished?: boolean;
}

/** Who/what a draft is about, before any database work. */
export interface AnnouncementInput {
  text: string;
  postedAt: Date | null;
  links: string[];
}

/** Parse an announcement, or return null when the text is ordinary chatter. */
export function parseAnnouncement(input: AnnouncementInput): ParsedCourse | null {
  const msg: FeedMessage = {
    postId: null,
    date: input.postedAt,
    text: input.text,
    links: input.links,
    fileName: null,
    fileList: [],
    isPoll: false,
    isPhoto: false,
  };
  return looksLikeCoursePost(msg);
}

/**
 * Signals that make an announcement trustworthy. A course post in this group
 * nearly always carries several; a one-line "check this out" carries none.
 */
export function announcementSignals(text: string, parsed: ParsedCourse): string[] {
  const signals: string[] = [];
  if (parsed.taughtBy.length > 0) signals.push('taught-by');
  if (parsed.originalPrice !== null) signals.push('price');
  if (parsed.durationMin !== null) signals.push('hours');
  if (parsed.lessonCount !== null) signals.push('lesson-count');
  if (parsed.ratingAvg !== null) signals.push('rating');
  if (parsed.hashtags.length > 0) signals.push('hashtags');
  if (/download (full |the )?courses?/i.test(text)) signals.push('download-line');
  if (parsed.sourceUrl) signals.push('source-link');
  if (parsed.description.length >= 60) signals.push('description');
  // The `🔅` template writes a level and a topic list instead of a price and
  // lesson count. They are just as strong a sign that this is a real course.
  if (/(?:🔰\s*)?Level\s*:/i.test(text)) signals.push('level');
  if (/📋\s*Topics?\s*:/i.test(text)) signals.push('topics');
  if (/🔗\s*Join\b.*\bfor more courses\b/i.test(text)) signals.push('join-line');
  return signals;
}

/**
 * Confidence is a reading aid, not a gate: a low score still creates a draft,
 * it just tells the reviewer to look harder. Only obvious automation ignores
 * this value.
 */
export function confidenceFrom(signals: string[], parsed: ParsedCourse): number {
  const weights: Record<string, number> = {
    'taught-by': 0.2,
    price: 0.15,
    hours: 0.15,
    'lesson-count': 0.1,
    rating: 0.05,
    hashtags: 0.1,
    'download-line': 0.2,
    'source-link': 0.05,
    description: 0.1,
    level: 0.1,
    topics: 0.1,
    'join-line': 0.05,
  };
  let score = 0.2;
  for (const s of signals) score += weights[s] ?? 0;
  // A title that is only an emoji plus "Course" is not a title.
  if (parsed.title.replace(/[^a-z0-9]/gi, '').length < 4) score -= 0.25;
  return Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))));
}

/**
 * The catalogue's own slugs. `feed-importer.ts` still maps some hashtags to
 * slugs this database does not have (`ai-and-machine-learning`,
 * `devops-and-cloud`), which would create a second category with the same
 * meaning. New code uses the real ones.
 */
const HASHTAG_CATEGORY: Record<string, string> = {
  ai: 'artificial-intelligence',
  artificialintelligence: 'artificial-intelligence',
  ml: 'ai-machine-learning',
  machinelearning: 'ai-machine-learning',
  datascience: 'data-science',
  python: 'programming',
  javascript: 'web-development',
  react: 'web-development',
  node: 'web-development',
  webdev: 'web-development',
  webdevelopment: 'web-development',
  flutter: 'mobile-development',
  android: 'mobile-development',
  ios: 'mobile-development',
  devops: 'devops-cloud',
  cloud: 'devops-cloud',
  linux: 'devops-cloud',
  security: 'devops-cloud',
  network: 'networking',
  ccna: 'networking',
  design: 'design',
  figma: 'design',
  ux: 'design',
  ui: 'design',
  business: 'business',
  finance: 'business',
  genai: 'gen-ai',
  llm: 'gen-ai',
  rag: 'gen-ai',
  quran: 'quran-tafseer',
  tafseer: 'quran-tafseer',
};

/**
 * Ordered keyword rules. A course matches at most three, so a title like
 * "Python for Machine Learning" lands in Programming and AI/ML without also
 * collecting every incidental word.
 */
const KEYWORD_RULES: Array<{ slug: string; words: RegExp }> = [
  { slug: 'quran-tafseer', words: /\b(quran|tafseer|tafsir|surah|islamic)\b/i },
  { slug: 'gen-ai', words: /\b(gen(erative)?[ -]?ai|llm|rag|prompt engineering|langchain|crewai|openai|chatgpt|gpt-4|gpt4)\b/i },
  { slug: 'ai-machine-learning', words: /\b(machine learning|deep learning|neural|pytorch|tensorflow|scikit|hugging face|transformer model)\b/i },
  { slug: 'artificial-intelligence', words: /\b(artificial intelligence|\bai\b|computer vision|nlp|natural language)\b/i },
  { slug: 'data-science', words: /\b(data science|pandas|numpy|matplotlib|statistics|data analysis|data analyst|seaborn)\b/i },
  { slug: 'mobile-development', words: /\b(flutter|dart|android|ios|swift|kotlin|react native|mobile app)\b/i },
  { slug: 'web-development', words: /\b(html|css|javascript|typescript|react|next\.?js|node\.?js|vue|angular|full[- ]stack|web development|frontend|backend)\b/i },
  { slug: 'devops-cloud', words: /\b(docker|kubernetes|k8s|aws|azure|gcp|devops|terraform|ci\/cd|serverless)\b/i },
  { slug: 'networking', words: /\b(cisco|ccna|packet tracer|networking|tcp\/ip)\b/i },
  { slug: 'design', words: /\b(design|figma|photoshop|illustrator|ui\/ux|user experience)\b/i },
  { slug: 'business', words: /\b(business|marketing|finance|entrepreneur|management|sales)\b/i },
  { slug: 'programming', words: /\b(python|java|c\+\+|c#|golang|\bgo\b|rust|ruby|php|programming|coding|software engineer|algorithm|data structure|object oriented|interview)\b/i },
];

/**
 * Categories for a draft: explicit hashtags first, keyword evidence second.
 * `topicOverride` comes from `TELEGRAM_TOPIC_CATEGORIES` for a forum topic that
 * is dedicated to one subject.
 */
export function categorize(input: {
  title: string;
  description: string;
  hashtags: string[];
  fileNames: string[];
  topicOverride?: string | null;
}): string[] {
  const picked = new Set<string>();

  if (input.topicOverride) picked.add(input.topicOverride);

  for (const tag of input.hashtags) {
    const mapped = HASHTAG_CATEGORY[tag.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (mapped) picked.add(mapped);
    if (picked.size >= 4) break;
  }

  const haystack = `${input.title}\n${input.description}\n${input.fileNames.join('\n')}`;
  const scored: Array<{ slug: string; hits: number }> = [];
  for (const rule of KEYWORD_RULES) {
    const hits = (haystack.match(new RegExp(rule.words.source, 'gi')) ?? []).length;
    if (hits > 0) scored.push({ slug: rule.slug, hits });
  }
  scored.sort((a, b) => b.hits - a.hits);
  for (const { slug } of scored) {
    if (picked.size >= 3) break;
    picked.add(slug);
  }

  return [...picked].slice(0, 3);
}

/**
 * "07. The_InitState_Method - Part 02.zip" → module "07. The InitState Method",
 * part 2. The same rules the feed importer uses, so a course imported either
 * way shows identical module names in the app.
 */
export function moduleFromFile(fileName: string, order: number): { moduleTitle: string | null; partIndex: number } {
  const part = partFromFile(fileName, order, null, null);
  return {
    moduleTitle: part.moduleTitle || null,
    partIndex: part.partNo ?? 1,
  };
}

/**
 * Part numbers restart inside every module, and filenames are not always
 * numbered. Assign the next free slot instead of trusting the name blindly.
 */
export function nextPartIndex(files: DraftFile[], moduleTitle: string | null, claimed?: number): number {
  const sameModule = files.filter((f) => (f.moduleTitle ?? null) === (moduleTitle ?? null));
  const used = new Set(sameModule.map((f) => f.partIndex));
  if (claimed && claimed > 0 && !used.has(claimed)) return claimed;
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** Guard against a malformed filename leaking a path or a control character. */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
}

export function draftSlug(title: string): string {
  return slugify(title) || 'course';
}

/**
 * Compare titles the way a reader would: case, accents, emoji, punctuation and
 * "&"/"and" are not part of a course's identity. Used to stop an announcement
 * from creating a second row when the same course was already added by hand.
 */
export function normalizeCourseTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
