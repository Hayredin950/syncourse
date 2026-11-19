/**
 * What the assistant knows about Syncourse itself.
 *
 * Course files can answer "what is RAG?"; they cannot answer "what is the
 * difference between a full course and a mini-course here?". Those answers come
 * from the product's own rules and from live catalogue figures. Facts are kept
 * in topics so a question gets the relevant answer instead of the same
 * introduction every time.
 */

export interface SystemStats {
  courses: number;
  fullCourses: number;
  miniCourses: number;
  premiumCourses: number;
  freeCourses: number;
  resources: number;
  categories: number;
  lecturers: number;
  files: number;
}

interface SystemTopic {
  id: string;
  label: string;
  /** Matched against a canonical (typo-normalised, lower-case) question. */
  keywords: string[];
  facts: string[];
}

export const PRODUCT_FACTS = [
  'Syncourse is a catalogue of practical, project-based courses for people who build things.',
  'Its two catalogue kinds are Courses (including Mini-courses) and Resources (ebooks, notes, cheat-sheets, templates and videos), plus Roadmaps that order courses into a learning path.',
  'Course pages list lessons, the original module files, the source rating and community ratings and reviews.',
  'Free courses need no account. An account adds saved courses, collections, circles, progress and the ability to rate or review.',
  'Premium unlocks premium courses; the free catalogue stays free and premium text is never shown to non-members.',
  'Course files are delivered by the @syncourse_bot in Telegram, one part at a time.',
  'Android, Windows and macOS apps are linked in the footer, and support is available through Contact support.',
].join('\n');

const OVERVIEW_FACTS = [
  'Syncourse is a catalogue of practical, project-based courses for people who build things.',
  'It brings together full courses, mini-courses and free resources such as ebooks, notes, templates and videos, plus roadmaps that put them in order.',
  'You can browse or search the catalogue, open a course to see its lessons and original files, save courses into collections, follow circles, and ask this assistant about anything in the library.',
  'Free courses need no account, and Premium unlocks the premium ones. Apps for Android, Windows and macOS are linked in the footer.',
];

const TOPICS: SystemTopic[] = [
  {
    id: 'content-types',
    label: 'Full courses, mini-courses, resources and roadmaps',
    keywords: [
      'mini course',
      'full course',
      'regular course',
      'difference between course',
      'course vs',
      'vs course',
      'versus',
      'content type',
      'what is a course',
      'what is a mini course',
      'course and resource',
      'course or resource',
      'roadmap and course',
    ],
    facts: [
      'A full course is a complete curriculum: lessons, module files, a course page, ratings and reviews. It is the default catalogue item and appears under All Courses / Browse.',
      'A mini-course is the same kind of course with a shorter scope: a focused topic, usually 90 minutes or less, 12 lessons or fewer, or one to three module archives. It has the same lessons, files, ratings and downloads; only its size differs.',
      'The catalogue labels a post as a mini-course when it says so explicitly (mini-course, crash course, quick course), when its stated duration is 90 minutes or less, when it has 12 lessons or fewer, or when it arrives as one to three module ZIPs. Longer or larger material is a full course.',
      'The distinction is scope, not quality or access: both full courses and mini-courses can be free or Premium, and both download the same way.',
      'Mini-courses have their own tab at /browse?type=mini-course; full courses are under All Courses. Resources (ebooks, notes, cheat-sheets, templates, videos) live at /resources, and Roadmaps live at /paths.',
    ],
  },
  {
    id: 'catalogue',
    label: 'Browsing and searching the catalogue',
    keywords: [
      'browse',
      'search',
      'catalogue',
      'catalog',
      'filter',
      'category',
      'categories',
      'level',
      'sort',
      'all courses',
      'mini courses',
      'find a course',
      'how many courses',
    ],
    facts: [
      'Browse (/browse) lists Courses and Mini-courses with filters for category, level, minimum rating, organisation and lecturer, plus sorting by newest, top rated, most downloaded or A–Z.',
      'Search accepts a tool name, a subject or a lecturer; the catalogue also matches tags, categories and close spellings.',
      'Resources (/resources) are separate from courses: ebooks, notes, cheat-sheets, templates and videos with their own search and type filter.',
      'Roadmaps (/paths) are ordered learning paths that put courses into a recommended sequence.',
      'Categories and lecturers have their own pages, so a reader can continue from a course to everything else by the same teacher or on the same subject.',
    ],
  },
  {
    id: 'account',
    label: 'Accounts, saving, collections, circles and progress',
    keywords: [
      'account',
      'sign in',
      'sign up',
      'log in',
      'login',
      'register',
      'save a course',
      'saved course',
      'collection',
      'circle',
      'progress',
      'profile',
      'do i need an account',
      'without an account',
    ],
    facts: [
      'Free courses can be read without an account.',
      'An account adds saved courses, collections, circles, learning progress, ratings and reviews.',
      'Collections group saved courses into a named list; circles are community spaces for a subject, and signed-in readers can follow them and post.',
      'Progress is tracked per signed-in reader, so a lesson marked complete stays complete on another device.',
      'Sign in from the top-right of the site; the account page is /me.',
    ],
  },
  {
    id: 'premium',
    label: 'Free and Premium access',
    keywords: [
      'premium',
      'paid',
      'unlock',
      'subscription',
      'price of premium',
      'free course',
      'free courses',
      'free alternative',
      'free alternatives',
      'is it free',
      'pay',
      'membership',
      'member',
    ],
    facts: [
      'The catalogue contains free and Premium courses. Free courses need no account and no payment.',
      'Premium unlocks the Premium courses; the free catalogue stays free.',
      'Free alternatives to a Premium topic do exist when the same subject has a free course. Search that topic and look for courses without the Premium marker, or ask the assistant for the closest free course on the subject.',
      'A Premium course is visible and can be opened, but its protected text is not shown to a non-member. The assistant lists it as locked and never quotes its lesson text to a non-member.',
      'An active member can ask the assistant about Premium material and get citations from it.',
    ],
  },
  {
    id: 'files',
    label: 'Course files and downloads',
    keywords: [
      'download',
      'course file',
      'course files',
      'module file',
      'module files',
      'lesson file',
      'zip',
      'attachment',
      'delivered',
      'telegram bot',
      'syncourse bot',
      'offline',
      'file size',
    ],
    facts: [
      'A course page lists its modules and the original files the course was published with.',
      'Files are delivered by the @syncourse_bot in Telegram. Tapping one part sends only that part; Download all sends the full set in order.',
      'The catalogue stores the Telegram file reference, not a second copy, so delivery goes through the bot rather than a direct web download.',
      'A file that Telegram cannot hand to the web app still opens through the bot deep link on the course page.',
      'Files are grouped by module title and part number; a module can have more than one part.',
    ],
  },
  {
    id: 'ratings',
    label: 'Ratings, reviews and votes',
    keywords: [
      'rating',
      'ratings',
      'review',
      'reviews',
      'vote',
      'votes',
      'stars',
      'how is it rated',
      'write a review',
    ],
    facts: [
      'A course can carry an imported source rating from its original announcement, shown with its vote count (for example 4.5 from 21,424 votes).',
      'Community ratings and written reviews are added on top of that source rating.',
      'Signed-in readers can rate a course and write a review from its page; spoilers can be marked.',
      'The course page shows the combined rating, the vote count and the review thread separately from the source rating.',
    ],
  },
  {
    id: 'assistant',
    label: 'How the study assistant answers',
    keywords: [
      'assistant',
      'how do you answer',
      'how does this work',
      'citation',
      'citations',
      'source',
      'sources',
      'grounded',
      'hallucinate',
      'invent',
      'daily limit',
      'question limit',
      'request limit',
      'rate limit',
      'too many questions',
      'premium text',
    ],
    facts: [
      'The study assistant answers catalogue questions from lesson transcripts, PDFs, notes and course overviews, and cites the file behind each claim.',
      'It also answers questions about Syncourse itself — content types, access, downloads, accounts and navigation — from the product rules on this page, not from course files.',
      'When the catalogue has nothing relevant, it says so instead of guessing; that empty answer is not a quota message — the daily question limit is reported separately.',
      'It is designed not to invent lessons, instructors, prices or statistics.',
      'Anonymous readers get a limited number of questions per day; signed-in members get a larger allowance.',
      'Premium course text is only retrieved for an active member. For everyone else the course is listed as locked.',
      'Follow-up questions keep the previous subject, so “and the second one?” still refers to the course just discussed.',
    ],
  },
  {
    id: 'roadmaps',
    label: 'Roadmaps and learning paths',
    keywords: ['roadmap', 'learning path', 'learning paths', 'path', 'curriculum order', 'what should i learn first'],
    facts: [
      'Roadmaps are ordered learning paths: a sequence of courses chosen to take a reader from one level to the next.',
      'They live at /paths and can appear on the home page when featured.',
      'A roadmap is guidance, not a locked bundle: each course in it keeps its own page, rating and files.',
    ],
  },
  {
    id: 'adding-content',
    label: 'Adding courses, files and resources',
    keywords: [
      'add to catalogue',
      'add a course',
      'create a course',
      'publish',
      'admin',
      'staff',
      'telegram group',
      'watcher',
      'ingest',
      'upload a course',
      'attach file',
    ],
    facts: [
      'Adding content is staff-only. Readers cannot publish a course from the assistant.',
      '“Add to catalogue” is the assistant’s write mode: a staff member writes a strict command, the assistant shows a summary, and nothing is written until it is confirmed. It creates the course shell (title, lecturer, category, price, type).',
      'The Telegram watcher is the full ingest path: a course announcement in the group is parsed for title, lecturer, description, rating and price, and the module ZIPs posted afterwards join the same draft.',
      'The watcher auto-publishes only when the title, lecturer, description, confidence and at least one file are all present. Otherwise the draft waits in the review queue.',
      'A draft that matches an existing course by title and lecturer updates that course and adds only new files instead of creating a duplicate.',
      'Resources can be added from the admin console or from a Telegram post that is a picture, book, note or roadmap.',
    ],
  },
  {
    id: 'apps',
    label: 'Apps, support and contact',
    keywords: ['app', 'apps', 'android', 'windows', 'macos', 'mac', 'desktop', 'mobile app', 'support', 'contact', 'help'],
    facts: [
      'Syncourse has Android, Windows and macOS apps linked in the site footer.',
      'The web catalogue works in a browser without installing an app.',
      'Support is available through the Contact support link in the footer, and the Terms, Privacy and Refunds pages are linked there too.',
    ],
  },
];

const SELF_REFERENCE = /\bsyncourse\b/i;
const DOMAIN = /\bsyncourse\.(?:pages\.dev|vercel\.app|com)\b/i;
const DEIXIS = /\b(?:this|your|the)\s+(?:web\s*app|website|site|platform|app|catalogue|catalog|service|product|page)\b/i;
const INTENT =
  /\b(?:what\s+(?:is|does|do)|tell\s+me\s+about|explain|about|purpose|how\s+does|how\s+do\s+i\s+use|who\s+(?:made|built|runs)|is\s+this|can\s+i)\b/i;
/** "Does Syncourse have a Dart course?" is a catalogue question, not a product one. */
const CATALOGUE_SUBJECT = /\b(?:courses?|lessons?|learn|teach|study|curriculum|syllabus|tutorial)\b/i;
const PRODUCT_DEFINITION =
  /\b(?:what\s+is\s+syncourse|how\s+does\s+syncourse\s+work|tell\s+me\s+about\s+syncourse|who\s+(?:made|built|runs)\s+syncourse)\b/i;

/**
 * Normalise the spelling people actually type. "corse", "cource", "minicouse"
 * and "mini-cource" are the same words as "course" and "mini-course"; matching
 * the misspelling is what stops a real product question from falling through to
 * catalogue retrieval and coming back empty.
 */
export function canonicalQuestion(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\bmini[- ]?c(?:ou|o)r?(?:s|se|ces?)?e?s?\b/g, ' mini course ')
    .replace(/\bc(?:ou|o)r?(?:s|se|ces?)?e?s?\b/g, ' course ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True only for questions about Syncourse itself. */
export function isProductQuestion(question: string): boolean {
  const text = (question ?? '').trim();
  if (!text) return false;

  const namesProduct = SELF_REFERENCE.test(text) || DOMAIN.test(text);
  if (namesProduct) {
    return !(CATALOGUE_SUBJECT.test(text) && !PRODUCT_DEFINITION.test(text));
  }
  return DEIXIS.test(text) && INTENT.test(text);
}

/**
 * Unambiguous platform features. A match here is enough to answer without
 * searching the catalogue: no course file can explain how Syncourse itself
 * works, and retrieval would only quote an unrelated lesson.
 */
const STRONG_SYSTEM_PATTERNS: RegExp[] = [
  /\b(?:difference|compare|comparison|vs\.?|versus)\b.*\b(?:mini course|full course|regular course|resource|roadmap)\b/,
  /\b(?:mini course|full course)\b.*\b(?:difference|vs\.?|versus|mean|explain)\b/,
  /\bwhat\s+is\s+(?:a\s+)?(?:mini course|full course)\b/,
  /\b(?:mini course|full course)\b.*\b(?:syncourse|this site|your site)\b/,
  /\b(?:do|need|require|must)\b.*\b(?:account|sign in|sign up|log in)\b/,
  /\bwithout\s+an?\s+account\b/,
  /\b(?:free|cheaper)\b.*\b(?:alternative|alternatives|instead|equivalent)\b/,
  /\b(?:download|deliver)\b.*\b(?:a|the|this|that)\s+course\b/,
  /\bdownload all\b/,
  /\b(?:course|module|lesson)\s+(?:file|files|part|parts)\b.*\b(?:download|delivered|delivery)\b/,
  /\b(?:download|deliver)\b.*\b(?:course|module|lesson)\s+(?:file|files|part|parts)\b/,
  /\bfrom the course page\b/,
  /\btelegram\b.*\b(?:bot|file|download|deliver|watcher|group|ingest|draft)\b/,
  /\b(?:study assistant|this assistant|the assistant|the ai assistant)\b/,
  /\b(?:request|question|daily|rate)\s+limit\b/,
  /\btoo many questions\b/,
  /\bcitations?\b/,
  /\bgrounded\b/,
  /\b(?:add to catalogue|add a course|publish a course)\b/,
  /\b(?:is there|do you have|where is|where can i get|how do i get|download)\b.*\b(?:android|windows|macos|desktop)\s+app\b/,
  /\bcontact support\b/,
  /\bwhat\s+is\s+premium\s*$/,
  /\bpremium\s+(?:mean|include|give|offer)\b/,
  /\bhow\s+(?:many|much)\b.*\b(?:course|mini course|resource|lecturer|categor)\w*\b/,
  /\bwhat\s+(?:course|mini course|resource)s?\b.*\b(?:catalogue|catalog|have|available)\b/,
];

/**
 * Features whose vocabulary is also ordinary course-subject vocabulary:
 * "collections" in Java, "ratings" in a recommender system, "premium pricing"
 * in economics. These are only treated as product questions when the reader is
 * clearly talking about Syncourse, so the catalogue gets first refusal.
 */
const WEAK_SYSTEM_PATTERNS: RegExp[] = [
  /\b(?:what|how|unlock|difference|benefit|cost|price|mean)\b.*\bpremium\b/,
  /\bpremium\b.*\b(?:course|free|unlock|cost|price|alternative|alternatives)\b/,
  /\bwhat\s+is\s+premium\b/,
  /\b(?:save|saved|bookmark)\b.*\bcourse\b/,
  /\b(?:save|saved|bookmark|create|make|my)\b.*\bcollections?\b/,
  /\bcollections?\b.*\b(?:save|course|catalogue|syncourse)\b/,
  /\bhow\s+(?:do|does)\s+collections?\b/,
  /\b(?:join|follow|create)\b.*\bcircles?\b/,
  /\bcircles?\b.*\b(?:join|follow|post|community|course|syncourse)\b/,
  /\bhow\s+(?:do|does)\s+circles?\b/,
  /\b(?:how|what|write|leave|can i)\b.*\b(?:rating|ratings|review|reviews|stars|votes)\b/,
  /\bhow\s+(?:do|are|is)\s+(?:ratings?|reviews?|votes?)\b/,
  /\b(?:rating|ratings|reviews?)\b.*\b(?:course|lesson|instructor|syncourse|write|leave)\b/,
  /\b(?:create|make)\s+(?:a\s+)?course\b/,
  /\b(?:roadmap|learning path)\b.*\b(?:syncourse|site|catalogue|catalog)\b/,
  /\b(?:support|refunds?|terms|privacy)\b.*\b(?:page|link|footer|syncourse|account|billing|service)\b/,
  /\b(?:terms|privacy)\s+(?:and|&)\s+(?:conditions|policy|refunds?)\b/,
  /\b(?:android|windows|macos|desktop)\s+app\b/,
];

/**
 * Subjects that live in course files. A weak platform word next to one of these
 * is almost always about the subject, not about Syncourse: "how do collections
 * work in Java", "how do ratings work in recommender systems".
 */
const TECHNICAL_SUBJECT =
  /\b(?:java|python|javascript|typescript|rust|golang|go lang|c\+\+|c#|php|ruby|kotlin|swift|sql|react|vue|angular|node|next\.?js|django|flask|laravel|flutter|dart|android|ios|machine learning|deep learning|neural networks?|recommender systems?|data science|statistics|economics|finance|accounting|marketing|pricing|law|biology|chemistry|physics|networking|ccna|aws|docker|kubernetes|linux|git|n8n|rag|llm|prompt engineering)\b/i;

/** Mentions the product by name or points at it with "this site". */
function namesProduct(text: string): boolean {
  return SELF_REFERENCE.test(text) || DOMAIN.test(text);
}

/**
 * How much the question is about Syncourse itself.
 *
 * `strong` means answer it from product knowledge immediately. `weak` means a
 * platform word matched but the question might be about a course subject; let
 * retrieval try first and fall back to product knowledge only if nothing in the
 * catalogue is relevant. `null` means it is a catalogue question.
 */
export function systemQuestionStrength(question: string): 'strong' | 'weak' | null {
  if (isProductQuestion(question)) return 'strong';

  const raw = (question ?? '').trim();
  const text = canonicalQuestion(raw);
  if (!text) return null;

  if (STRONG_SYSTEM_PATTERNS.some((pattern) => pattern.test(text))) return 'strong';

  const weak = WEAK_SYSTEM_PATTERNS.some((pattern) => pattern.test(text));
  if (!weak) return null;

  // "How are ratings shown on a course?" names a platform noun plus the
  // catalogue; that is Syncourse even though it sounds technical.
  if (namesProduct(raw) || /\b(?:syncourse|catalogue|catalog)\b/.test(text)) return 'strong';

  // A weak word next to a real subject belongs to that subject.
  if (TECHNICAL_SUBJECT.test(raw)) return null;

  return 'weak';
}

/**
 * A question about the product or the catalogue system, even without the word
 * "Syncourse". Course-subject questions ("how do I download a file in Python")
 * stay with retrieval because the pattern requires a platform feature, not just
 * a shared word.
 */
export function isSystemQuestion(question: string): boolean {
  return systemQuestionStrength(question) !== null;
}

/** The tooltip the system prompt uses; the whole knowledge base in one string. */
export function systemKnowledge(): string {
  return [
    PRODUCT_FACTS,
    '',
    ...TOPICS.map((topic) => `${topic.label}:\n${topic.facts.map((f) => `- ${f}`).join('\n')}`),
  ].join('\n');
}

export function formatStats(stats?: SystemStats | null): string {
  if (!stats) return '';
  return [
    `Live catalogue figures right now: ${stats.courses} courses (${stats.fullCourses} full, ${stats.miniCourses} mini-courses), ${stats.resources} resources, ${stats.categories} categories, ${stats.lecturers} lecturers and ${stats.files} delivered module files.`,
    `${stats.freeCourses} of the ${stats.courses} courses are free; ${stats.premiumCourses} are Premium.`,
  ].join(' ');
}

/**
 * Pick the topics that answer the question. Longer keyword phrases score more,
 * so "mini course" beats a bare "course" when both are present.
 */
function scoredTopics(question: string): Array<{ topic: SystemTopic; score: number }> {
  const text = canonicalQuestion(question);
  if (!text) return [];
  return TOPICS.map((topic) => ({
    topic,
    score: topic.keywords.reduce(
      (sum, keyword) => sum + (text.includes(canonicalQuestion(keyword)) ? keyword.split(' ').length : 0),
      0,
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function selectSystemTopics(question: string): SystemTopic[] {
  return scoredTopics(question)
    .slice(0, 3)
    .map((entry) => entry.topic);
}

/**
 * A deterministic answer when no model is configured. It is topic-specific:
 * the same generic introduction for every question is exactly what made the
 * assistant look scripted.
 */
export function productAnswer(question?: string, stats?: SystemStats | null): string {
  const ranked = question ? scoredTopics(question) : [];
  const figure = formatStats(stats);

  if (ranked.length === 0) {
    return [...OVERVIEW_FACTS, '', figure].filter(Boolean).join('\n');
  }

  // One clearly dominant topic gets a focused answer; two close topics are
  // both relevant. Dumping three topics is what made answers read like a guide.
  const topics =
    ranked.length > 1 && ranked[1].score * 2 > ranked[0].score
      ? ranked.slice(0, 2).map((entry) => entry.topic)
      : [ranked[0].topic];

  const blocks = topics.map((topic) => {
    const relevant = topic.facts.slice(0, 5).map((fact) => `- ${fact}`).join('\n');
    return `${topic.label}\n${relevant}`;
  });

  return [figure, ...blocks].filter(Boolean).join('\n\n');
}

/** The prompt for a system/product question. */
export function systemPrompt(question: string, stats?: SystemStats | null): string {
  const topics = selectSystemTopics(question);
  const chosen = topics.length > 0 ? topics : [];
  const focus = chosen.length
    ? chosen.map((topic) => `${topic.label}:\n${topic.facts.map((f) => `- ${f}`).join('\n')}`).join('\n\n')
    : '';

  return [
    'You are the Syncourse product and catalogue assistant. The reader is asking about Syncourse itself, not about the subject of a course.',
    '',
    'Answer the exact question, including the specific comparison or feature asked about. Do not reply with a generic introduction to Syncourse when the reader asked for a difference, a rule or a step.',
    '',
    'Use only the product knowledge and live figures below. If something is not covered, say what you do know and state plainly that it is not documented. Never invent a feature, price, count, route or policy.',
    '',
    'Knowledge base:',
    systemKnowledge(),
    '',
    focus ? `Most relevant topics:\n${focus}` : '',
    '',
    formatStats(stats),
    '',
    'Rules:',
    '- Be concise: 120 words or fewer unless the reader asks for a list.',
    '- Plain sentences. No headings and no preamble.',
    '- Do not cite course files for product facts. This answer is about the service.',
    '- If the question names a course subject (Flutter, Python, n8n), treat the product part only; the catalogue question belongs to retrieval.',
    '- Answer in the reader\'s language when it is clear.',
  ]
    .filter(Boolean)
    .join('\n');
}
