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
 * Which photo is this? Caption wins; the first uncaptioned photo becomes the
 * cover because that is where people naturally put it.
 */
export function mediaRole(caption: string | null, existing: DraftImage[]): DraftImageRole | null {
  const text = (caption ?? '').trim().toLowerCase();
  const has = (role: DraftImageRole) => existing.some((i) => i.role === role);

  if (/\b(cover|thumbnail|poster|banner)\b/.test(text)) return 'cover';
  if (/\b(lecturer|instructor|teacher|author)\b/.test(text)) return 'lecturer';
  if (/\b(org|organisation|organization|publisher|university|company|logo)\b/.test(text)) return 'organization';

  // `org: Udemy` and `lecturer: Stephen Grider` are both a role and a name.
  if (/^\s*(org|organisation|organization|publisher)\s*[:=]/.test(text)) return 'organization';
  if (/^\s*(lecturer|instructor|teacher)\s*[:=]/.test(text)) return 'lecturer';

  if (!text && !has('cover')) return 'cover';
  return null;
}

/** The name typed next to a role caption, if any (`lecturer: Stephen Grider`). */
export function mediaName(caption: string | null): string | null {
  const m = (caption ?? '').match(/\b(?:lecturer|instructor|teacher)\s*[:=]\s*(.+)$/i);
  if (m) return m[1].trim().slice(0, 120) || null;
  const org = (caption ?? '').match(/\b(?:org|organisation|organization|publisher)\s*[:=]\s*(.+)$/i);
  return org ? org[1].trim().slice(0, 120) || null : null;
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

  if (!(f.title ?? a.title)?.trim()) blockers.push('title');
  if (payload.signals.includes('course-exists')) blockers.push('already-exists');
  if ((payload.confidence ?? 0) < 0.7) blockers.push('low-confidence');

  if (kind === 'resource') {
    const body = (f.description ?? f.resourceSummary ?? a.description ?? '').trim();
    if (body.length < 60 && (payload.files?.length ?? 0) === 0) blockers.push('body');
    return blockers;
  }

  if ((f.lecturerNames ?? a.lecturerNames ?? []).filter(Boolean).length === 0) blockers.push('lecturer');
  const description = (f.description ?? a.description ?? '').trim();
  if (description.length < 80) blockers.push('description');
  if ((payload.files?.length ?? 0) === 0) blockers.push('files');
  return blockers;
}
