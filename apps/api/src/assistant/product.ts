/**
 * What the assistant knows about Syncourse itself.
 *
 * The catalogue's files describe other people's courses; nothing inside them
 * can answer "what is this website?". These facts come from the product's own
 * UI and footer, so they are stated directly instead of retrieved — and they
 * are kept short and stable, because a made-up product detail is worse than a
 * plain one.
 */

export const PRODUCT_FACTS = [
  'Syncourse is a catalogue of practical, project-based courses for people who build things.',
  'The library includes full courses, mini-courses, free resources (ebooks, notes, templates, videos) and roadmaps.',
  'Course pages list the lessons and the original files a course was published with, and every file can be opened from the course page.',
  'The study assistant (this page) answers only from catalogue material and links each claim back to the file it came from; when nothing matches it says so.',
  'Browsing and free courses need no account. An account adds saved courses, collections, circles and learning progress.',
  'Premium unlocks premium courses; the free catalogue stays free.',
  'Apps for Android, Windows and macOS are linked in the footer, and support is available through the Contact support link.',
  'The site is served at syncourse.pages.dev and syncourse.vercel.app.',
].join('\n');

const SELF_REFERENCE = /\bsyncourse\b/i;
const DOMAIN = /\bsyncourse\.(?:pages\.dev|vercel\.app|com)\b/i;
const DEIXIS = /\b(?:this|your|the)\s+(?:web\s*app|website|site|platform|app|catalogue|catalog|service|product|page)\b/i;
const INTENT = /\b(?:what\s+(?:is|does|do)|tell\s+me\s+about|explain|about|purpose|how\s+does|how\s+do\s+i\s+use|who\s+(?:made|built|runs)|is\s+this|can\s+i)\b/i;

/**
 * True only for questions about Syncourse itself.
 *
 * "How do I build a web app" is a course question: it has intent but no
 * self-reference. "Tell me about this web app" is about the page the reader is
 * on, even without the product name.
 */
export function isProductQuestion(question: string): boolean {
  const text = (question ?? '').trim();
  if (!text) return false;
  if (SELF_REFERENCE.test(text) || DOMAIN.test(text)) return true;
  return DEIXIS.test(text) && INTENT.test(text);
}

/** A deterministic answer, with no citations because it quotes no course. */
export function productAnswer(): string {
  return [
    'Syncourse is a catalogue of practical, project-based courses for people who build things.',
    'It brings together full courses, mini-courses and free resources such as ebooks, notes, templates and videos, plus roadmaps that put them in order.',
    '',
    'You can browse or search the catalogue, open a course to see its lessons and original files, save courses into collections, follow circles, and ask this assistant about anything in the library — answers are built from the course files and cite the file behind each claim.',
    '',
    'Free courses need no account, and Premium unlocks the premium ones. Apps for Android, Windows and macOS are linked in the footer.',
  ].join('\n');
}
