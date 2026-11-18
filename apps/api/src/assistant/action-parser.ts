/**
 * action-parser.ts — the deterministic grammar behind the assistant's write
 * mode. Kept out of the service so it can be tested without Nest, Prisma or a
 * Telegram token.
 *
 * The grammar is intentionally strict. "Make me a course about Flutter" is a
 * sentence a model could interpret five ways; a title, an instructor and a
 * price are data, and guessing them is how a typo becomes a published course.
 */
export type ActionKind = 'create_course' | 'create_resource' | 'attach_file' | 'publish_draft';

export interface ActionFields {
  title?: string;
  instructor?: string;
  category?: string;
  price?: number | null;
  description?: string;
  contentType?: string;
  resourceType?: string;
  body?: string;
  url?: string;
  slug?: string;
  draftId?: string;
}

export function parseInstruction(input: string): { kind: ActionKind; fields: ActionFields } | null {
  const text = input.trim().replace(/^\/+/, '');

  const publish = text.match(/^(?:publish|approve)\s+draft\s+([a-z0-9]{4,})/i);
  if (publish) return { kind: 'publish_draft', fields: { draftId: publish[1] } };

  const attach = text.match(/^(?:attach|link)\s+(\S+)\s+(?:to|on)\s+(.+)$/i);
  if (attach) return { kind: 'attach_file', fields: { url: attach[1], slug: attach[2].trim() } };

  const resource = text.match(/^(?:create|add|new)\s+(?:a\s+)?resource\s*[:\-]?\s*(.+)$/i);
  if (resource) {
    const [title, body, type] = resource[1].split('|').map((p) => p.trim());
    return { kind: 'create_resource', fields: { title, body, resourceType: type } };
  }

  const course = text.match(/^(?:create|add|new|make)\s+(?:a\s+)?course\s*[:\-]?\s*(.+)$/i);
  if (course) {
    const rest = course[1].trim();
    if (rest.includes('|')) {
      const [title, instructor, category, price, type, description] = rest.split('|').map((p) => p.trim());
      return {
        kind: 'create_course',
        fields: { title, instructor, category, price: parsePrice(price), contentType: type, description },
      };
    }
    // "Title by Instructor" — the only free-form shape that stays unambiguous.
    const by = rest.match(/^(.+?)\s+by\s+(.+)$/i);
    if (by) {
      const [title, instructor] = [by[1].replace(/^["“]|["”]$/g, '').trim(), by[2].trim()];
      if (title.length >= 3 && instructor.length >= 2) {
        return { kind: 'create_course', fields: { title, instructor } };
      }
    }
  }

  return null;
}

export function parsePrice(value?: string): number | null | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (/^(free|none)$/i.test(trimmed)) return null;
  const digits = trimmed.replace(/[^0-9.]/g, '');
  // "$abc" has no number in it; `Number('')` would silently become 0 (free).
  if (!digits || !/[0-9]/.test(digits)) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

export function isTelegramLink(value: string): boolean {
  return /^https?:\/\/t\.me\//i.test(value);
}

export function summarize(kind: ActionKind, fields: ActionFields): string {
  switch (kind) {
    case 'create_course':
      return (
        `Create course “${fields.title}” by ${fields.instructor}` +
        (fields.category ? ` in ${fields.category}` : '') +
        (fields.price === null ? ' as free' : fields.price !== undefined ? ` at $${fields.price}` : '') +
        (fields.contentType === 'mini-course' ? ' (mini-course)' : '') +
        '.'
      );
    case 'create_resource':
      return `Create ${fields.resourceType ?? 'cheat-sheet'} “${fields.title}”${fields.body ? ' with a body' : ''}.`;
    case 'attach_file':
      return `Attach ${fields.url} to the course “${fields.slug}”.`;
    case 'publish_draft':
      return `Publish draft ${fields.draftId}.`;
  }
}
