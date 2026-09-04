// Types mirroring the NestJS API responses (apps/api/src/*).

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  level: string;
  durationMin: number;
  lessonCount: number;
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  isPremium: boolean;
  isNew?: boolean;
  rank?: number;
  contentType?: string;
  /** First credit only; `lecturerNames` carries every teacher. */
  lecturerName?: string | null;
  lecturerNames?: string[];
  organizationName?: string | null;
  categoryNames?: string[];
}

export interface Section {
  id: string;
  title: string;
  orderIndex: number;
  lessons: LessonLite[];
}

export interface LessonLite {
  id: string;
  title: string;
  orderIndex: number;
  type: string;
  durationSec: number;
  isPreview: boolean;
}

export interface Lecturer {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  credentials: string | null;
  courseCount?: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description?: string | null;
  subscribers?: number;
  courseCount?: number;
}

export interface Review {
  id: string;
  userName: string;
  userAvatar: string | null;
  rating: number;
  body: string | null;
  containsSpoilers: boolean;
  editedAt?: string | null;
  createdAt: string;
  replyCount: number;
  isStaff: boolean;
  upvotes?: number;
  upvoted?: boolean;
  /** True when the signed-in reader wrote it — gates the edit and delete controls. */
  mine?: boolean;
  // the API nests replies under each review; without this field mobile showed a
  // "3 replies" counter with no way to read them
  replies?: Review[];
}

export interface TelegramFile {
  id: string;
  moduleTitle: string | null;
  moduleOrder: number;
  partIndex: number;
  fileName: string | null;
  fileSizeMb: number | null;
  chatUsername: string | null;
  caption: string | null;
}

export interface CourseDetail extends CourseSummary {
  bannerUrl: string | null;
  previewVideoUrl: string | null;
  language: string;
  originalPrice: number | null;
  price: number | null;
  prerequisites: string | null;
  tags: string[];
  audience: string[];
  /** First credit, kept in step with `lecturers[0]` by the API. */
  lecturer: Lecturer | null;
  /** Every teacher credited, in the order the course credits them. */
  lecturers?: Lecturer[];
  organization: Organization | null;
  sections: Section[];
  ratings: { avg: number; count: number; distribution: Record<number, number> };
  /** Whether this reader saved / liked / rated it, plus the public like tally. */
  saved: boolean;
  liked: boolean;
  likeCount: number;
  myRating: number;
  reviews: Review[];
  downloads: { total: number; last30: number; last7: number; today: number };
  telegramFiles: TelegramFile[];
}

export interface Note {
  id: string;
  title: string;
  richText: string;
  imageUrls: string[];
  pdfUrl: string | null;
  isCheatsheet: boolean;
}

export interface LessonFile {
  id: string;
  label: string;
  format: string;
  sizeMb: number;
  durationSec: number;
  codec: string | null;
  hasSubtitles: boolean;
  audio: string | null;
  isBest: boolean;
}

export interface LessonDetail {
  id: string;
  title: string;
  orderIndex: number;
  type: string;
  durationSec: number;
  isPreview: boolean;
  sectionTitle: string | null;
  course: { id: string; title: string; slug: string };
  notes: Note[];
  files: LessonFile[];
  attachments: { id: string; fileUrl: string; fileType: string; sizeMb: number; fileName: string }[];
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  gender: string | null;
  isVerified: boolean;
  isStaff: boolean;
  planType: "free" | "premium";
  planExpiresAt: string | null;
  telegramUsername: string | null;
  memberSince: string;
  hasGoogle?: boolean;
  hasPassword?: boolean;
  settings?: { autoplayNext?: boolean; previewAutoplay?: boolean } | null;
  privacy?: Record<string, string> | null;
  stats: {
    downloaded: number;
    saved: number;
    liked: number;
    lists: number;
    reviews: number;
  };
}

export interface BestOfOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  courseCount: number;
  courses: CourseSummary[];
}

export interface FeaturedPath {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  courses: { id: string; title: string; slug: string; thumbnailUrl: string | null }[];
}

export interface HomeLecturer {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  credentials: string | null;
  courseCount: number;
}

export interface HomeOrganization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  subscribers: number;
  courseCount: number;
}

export interface HomeFeed {
  trending: CourseSummary[];
  latest: CourseSummary[];
  topRated: CourseSummary[];
  bestOf: BestOfOrg[];
  featuredPaths: FeaturedPath[];
  categories: Category[];
  lecturers: HomeLecturer[];
  organizations: HomeOrganization[];
}

/** GET /me/learning — what a reader saved, liked and downloaded. */
export interface LibraryCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  level: string;
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  isPremium: boolean;
  savedAt?: string;
  likedAt?: string;
  downloadedAt?: string;
}

export interface LibraryData {
  saved: LibraryCourse[];
  liked: LibraryCourse[];
  downloaded: LibraryCourse[];
  counts: { saved: number; liked: number; downloaded: number };
}

/** One course inside a collection — GET /collections/:id. */
export interface CollectionItem {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  level: string;
  addedAt: string;
}

export interface CourseCollection {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  savesCount: number;
  itemCount: number;
  ownerName: string | null;
  ownerUsername: string | null;
  createdAt: string;
  updatedAt: string;
  covers: string[];
  items?: CollectionItem[];
}

/**
 * GET /lists/:id — the summary plus the courses and the two per-viewer flags the
 * screen needs: `isOwner` decides whether the add/remove/edit controls exist at
 * all, and `saved` has to come from the API or a list you already saved reopens
 * reading "Save list".
 */
export interface CourseCollectionDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  savesCount: number;
  itemCount: number;
  ownerName: string;
  ownerUsername: string;
  isOwner: boolean;
  saved: boolean;
  createdAt: string;
  updatedAt: string;
  items: CollectionItem[];
}

/** One row of the "Add to list" sheet: a list plus whether it already holds the course. */
export interface CollectionMembership {
  id: string;
  name: string;
  visibility: "public" | "private";
  itemCount: number;
  contains: boolean;
}

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  weeklyEtb: number;
  priceEtb: number;
  priceUsd: number;
  isBestValue: boolean;
}

export interface DiscussionThread {
  id: string;
  userName: string;
  userAvatar: string | null;
  isStaff: boolean;
  body: string;
  containsSpoilers: boolean;
  upvotes: number;
  upvoted: boolean;
  replyCount: number;
  createdAt: string;
  depth: number;
  replies?: DiscussionThread[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  read: boolean;
  createdAt: string;
}

export interface AppVersion {
  id: string;
  version: string;
  changelogMd: string;
  releasedAt: string;
}

/** A published legal document (terms / privacy / refund). */
export interface LegalDoc {
  type: string;
  title: string;
  version: string;
  bodyMd: string;
  changeSummary: string | null;
  requiresAcceptance: boolean;
  effectiveAt: string;
  updatedAt: string;
}

export interface PendingLegalDoc {
  type: string;
  title: string;
  version: string;
  changeSummary: string | null;
  effectiveAt: string;
  updatedAt: string;
  /** Set when the document changed after this user had already agreed to it. */
  previousVersion: string | null;
  previousAcceptedAt: string | null;
}

export interface AcceptedLegalDoc {
  type: string;
  title: string;
  version: string;
  acceptedAt: string;
}

export interface LegalStatus {
  pending: PendingLegalDoc[];
  accepted: AcceptedLegalDoc[];
}

export interface LecturerDetail extends Lecturer {
  socialLinks?: Record<string, string>;
  courseCount?: number;
  courses: CourseSummary[];
}

export interface OrganizationDetail extends Organization {
  description: string | null;
  subscribers: number;
  courseCount?: number;
  courses: CourseSummary[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  courses: { id: string; title: string; slug: string; order: number; thumbnailUrl?: string | null }[];
}

export interface LearningPathDetail {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  courses: CourseSummary[];
}

export interface CircleMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  username: string;
  /** "owner" or "member" — the API decides, so the crown never disagrees with it. */
  role: string;
  joinedAt: string;
}

export interface CircleLite {
  id: string;
  name: string;
  description: string | null;
  owner: { name: string; avatarUrl: string | null; username: string };
  memberCount: number;
  postCount: number;
  joined: boolean;
  isOwner: boolean;
  createdAt: string;
}

export interface ActivityItem {
  type: "review" | "download";
  id: string;
  userName: string;
  userAvatar: string | null;
  username: string;
  course: { id: string; title: string; slug: string; thumbnailUrl: string | null };
  body?: string;
  createdAt: string;
}

export interface ActivityFeed {
  followingCount: number;
  items: ActivityItem[];
}

/**
 * A post on the circle wall. `canDelete` is decided by the API (author or owner)
 * so neither client has to re-implement the rule and get it subtly wrong.
 */
export interface CirclePost {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null; username: string };
  course: { id: string; title: string; slug: string; thumbnailUrl: string | null } | null;
  canDelete: boolean;
}

export interface CircleDetail extends CircleLite {
  /** Membership, resolved server-side — the composer shows off this alone. */
  canPost: boolean;
  members: CircleMember[];
  posts: CirclePost[];
  activity: ActivityItem[];
}

export interface CheckoutResult {
  subscriptionId: string;
  status: string;
  steps?: {
    step1: { title: string; text: string; accountName: string; accountNumber: string };
    step2: { title: string; hint: string };
  };
  redirectUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  coverImage: string | null;
  courseCount: number;
}

export interface Session {
  id: string;
  device: string | null;
  ip: string | null;
  active: boolean;
  createdAt: string;
}

export interface UserStats {
  engagedTotal: number;
  ratingDistribution: { stars: number; count: number }[];
  monthlyDownloads: { month: string; count: number }[];
  categoryCounts: { label: string; count: number }[];
  instructorCounts: { label: string; count: number }[];
  languageCounts: { label: string; count: number }[];
  topInstructors: { name: string; count: number; photoUrl: string | null }[];
  contentTypeBreakdown: { label: string; count: number; pct: number }[];
  difficultyBreakdown: { label: string; count: number; pct: number }[];
  yourWeek: { day: string; count: number }[];
  watchlistGrowth: { month: string; count: number }[];
  topTags: { label: string; count: number }[];
  pathProgress: { id: string; title: string; coverUrl: string | null; inLibrary: number; downloaded: number; total: number; pct: number }[];
  hasGoogle: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
}

export interface UserProfileFull extends UserProfile {
  sessions: Session[];
}

/**
 * Resources — cheat-sheets, roadmaps and notes.
 *
 * Short published artefacts rather than something you work through, so they
 * carry a body and an attachment list where a course carries a curriculum.
 * Mirrors `apps/web/src/lib/types.ts`.
 */
export type ResourceType = "cheat-sheet" | "roadmap" | "note";

export type ResourceMediaKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "slide"
  | "archive"
  | "code"
  | "link"
  | "other";

export interface ResourceMedia {
  id: string;
  kind: ResourceMediaKind;
  url: string | null;
  fileName: string | null;
  fileSizeMb: number | null;
  caption: string | null;
  orderIndex: number;
}

export interface ResourceSummary {
  id: string;
  type: string;
  title: string;
  slug: string;
  summary: string | null;
  coverUrl: string | null;
  isPremium: boolean;
  isFeatured: boolean;
  readMinutes: number;
  viewCount: number;
  downloadCount: number;
  publishedAt: string;
  category: { name: string; slug: string; icon: string } | null;
  organization: { name: string; slug: string } | null;
  lecturer: { name: string; slug: string } | null;
  tags: string[];
  mediaCount: number;
  mediaKinds: string[];
}

export interface ResourceDetail extends ResourceSummary {
  bodyMd: string;
  sourceUrl: string | null;
  updatedAt: string;
  media: ResourceMedia[];
  related: ResourceSummary[];
}

export interface ResourceList {
  total: number;
  results: ResourceSummary[];
  /** Whole-library totals per type, so the tab chips don't move when you filter. */
  counts: Record<string, number>;
  /** Categories that actually hold a resource — /categories is course-driven. */
  categories: { name: string; slug: string; icon: string; count: number }[];
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatDurationSec(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * "1 course", "2 courses", "1,204 votes".
 *
 * Thirty-odd call sites wrote `${n} courses` by hand, so every single-item row in
 * the app read "1 courses". English plurals are irregular often enough that the
 * caller can pass the plural when -s is wrong.
 */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/**
 * True when a stored file name is a storage key rather than something a person
 * typed.
 *
 * Cloudinary mints a 20-character public id when an upload arrives without
 * `use_filename` — `hsjghfs0im0k6l1p2fzj.mp4`. Printing that as a heading tells a
 * reader nothing except that we did not know what to call the file. The test:
 * one unbroken token, long, carrying digits, and with too few vowels to be
 * language. `algebra-cheatsheet.pdf` keeps its name (separator), so does
 * `Lecture 4.pdf` (space), and so does `roadmap.png` (short, no digits).
 *
 * Kept in step with the same function on the website — both render the same
 * uploads, and a name that is gibberish on one is gibberish on the other.
 */
export function isOpaqueFileName(name: string): boolean {
  const stem = name.split("/").pop()!.replace(/\.[a-z0-9]{1,5}$/i, "");
  if (stem.length < 12 || /[\s._-]/.test(stem)) return false;
  if (!/\d/.test(stem)) return false;
  const letters = stem.replace(/[^a-z]/gi, "");
  const vowels = stem.replace(/[^aeiou]/gi, "");
  return letters.length > 0 && vowels.length / letters.length < 0.25;
}

/**
 * What to print above a piece of media: the editor's caption if there is one,
 * the uploaded file name if it means anything, and otherwise the generic noun
 * the caller supplies ("Video", "Recording", "Document").
 */
export function mediaTitle(
  item: { fileName?: string | null; caption?: string | null },
  fallback: string,
): string {
  const name = item.fileName?.trim();
  if (name && !isOpaqueFileName(name)) return name;
  const cap = item.caption?.trim();
  if (cap) return cap;
  return fallback;
}
