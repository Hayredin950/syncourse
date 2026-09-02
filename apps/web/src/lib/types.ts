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
  isFeatured: boolean;
  contentType: string;
  categoryNames: string[];
  lecturerName: string | null;
  organizationName: string | null;
  publishedAt: string;
  rank?: number;
  isNew?: boolean;
}

export interface LessonLite {
  id: string;
  title: string;
  orderIndex: number;
  type: string;
  durationSec: number;
  isPreview: boolean;
}

export interface Section {
  id: string;
  title: string;
  orderIndex: number;
  lessons: LessonLite[];
}

export interface RatingBlock {
  avg: number;
  count: number;
  distribution: Record<string, number>;
}

export interface ReviewRow {
  id: string;
  userName: string;
  userAvatar: string | null;
  isStaff: boolean;
  rating: number;
  body: string;
  containsSpoilers: boolean;
  editedAt: string | null;
  createdAt: string;
  replyCount: number;
  upvotes?: number;
  upvoted?: boolean;
  replies?: ReviewRow[];
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
  lecturer: { id: string; name: string; slug: string; photoUrl: string | null; bio: string | null; credentials: string | null } | null;
  organization: { id: string; name: string; slug: string; logoUrl: string | null; description: string | null; subscribers: number } | null;
  sections: Section[];
  ratings: RatingBlock;
  reviews: ReviewRow[];
  downloads: { total: number; last30: number; last7: number; today: number; sparkline?: number[] };
  telegramFiles: TelegramFile[];
}

export interface LecturerRow {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  credentials: string | null;
  courseCount: number;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  subscribers: number;
  courseCount: number;
}

export interface LearningPathRow {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  courses: { id: string; title: string; slug: string; thumbnailUrl: string | null }[];
}

export interface LecturerDetail {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  credentials: string | null;
  socialLinks: Record<string, string>;
  createdAt: string;
  courses: {
    id: string;
    title: string;
    slug: string;
    description: string;
    thumbnailUrl: string | null;
    level: string;
    durationMin: number;
    ratingAvg: number;
    ratingCount: number;
    downloadCount: number;
    publishedAt: string;
    contentType?: string;
  }[];
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  orgType?: string; // university | company | publisher
  subscribers: number;
  createdAt: string;
  courses: {
    id: string;
    title: string;
    slug: string;
    description: string;
    thumbnailUrl: string | null;
    level: string;
    durationMin: number;
    ratingAvg: number;
    ratingCount: number;
    downloadCount: number;
    publishedAt: string;
  }[];
}

export interface HomeData {
  trending: CourseSummary[];
  latest: CourseSummary[];
  topRated: CourseSummary[];
  bestOf: { id: string; name: string; slug: string; logoUrl: string | null; courseCount: number; courses: CourseSummary[] }[];
  featuredPaths: {
    id: string;
    title: string;
    description: string;
    coverUrl: string | null;
    courseCount: number;
    ratingAvg: number;
    totalVotes: number;
    courses: { id: string; title: string; slug: string; thumbnailUrl: string | null }[];
  }[];
  categories: { id: string; name: string; slug: string; icon: string; coverImage: string | null; courseCount: number }[];
  lecturers: { id: string; name: string; slug: string; photoUrl: string | null; credentials: string | null; courseCount: number }[];
  organizations: { id: string; name: string; slug: string; logoUrl: string | null; subscribers: number; courseCount: number }[];
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

export interface LessonDetail {
  id: string;
  title: string;
  orderIndex: number;
  type: string;
  durationSec: number;
  isPreview: boolean;
  sectionTitle: string | null;
  course: { id: string; title: string; slug: string };
  notes: {
    id: string;
    title: string;
    richText: string;
    imageUrls: string[];
    pdfUrl: string | null;
    isCheatsheet: boolean;
  }[];
  files: {
    id: string;
    label: string;
    format: string;
    sizeMb: number;
    durationSec: number;
    codec: string | null;
    hasSubtitles: boolean;
    audio: string | null;
    isBest: boolean;
  }[];
  attachments: { id: string; fileUrl: string; fileType: string; sizeMb: number; fileName: string }[];
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

export interface CircleMemberRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  username: string;
  role: string;
  joinedAt: string;
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
  canPost: boolean;
  members: CircleMemberRow[];
  posts: CirclePost[];
  activity: {
    type: "review" | "download";
    id: string;
    userName: string;
    userAvatar: string | null;
    username: string;
    course: { id: string; title: string; slug: string; thumbnailUrl: string | null };
    body?: string;
    createdAt: string;
  }[];
}

/** A list as it appears in a grid or a rail — covers, counts, no items. */
export interface CollectionSummary {
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
}

export interface CollectionItemRow {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  level: string;
  addedAt: string;
}

export interface CollectionDetail {
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
  items: CollectionItemRow[];
}

/** One row of the "Add to list" sheet: a list plus whether it already holds the course. */
export interface CollectionMembership {
  id: string;
  name: string;
  visibility: "public" | "private";
  itemCount: number;
  contains: boolean;
}

export interface ActivityFeed {
  followingCount: number;
  items: {
    type: "review" | "download";
    id: string;
    userName: string;
    userAvatar: string | null;
    username: string;
    course: { id: string; title: string; slug: string; thumbnailUrl: string | null };
    body?: string;
    createdAt: string;
  }[];
}

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  priceEtb: number;
  priceUsd: number;
  weeklyEtb: number;
  isBestValue: boolean;
}

// --- admin CMS ---
export interface AdminCourseRow {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  thumbnailUrl: string | null;
  isPremium: boolean;
  isFeatured: boolean;
  ratingAvg: number;
  downloadCount: number;
  deleted: boolean;
  sectionCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  level: string | null;
  lecturer: string | null;
  organization: string | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  isStaff: boolean;
  isVerified: boolean;
  planType: string;
  createdAt: string;
  downloads: number;
  reviews: number;
  lists: number;
}

export interface AdminStats {
  courses: number;
  users: number;
  premiumSubscribers: number;
  revenue30d: number;
  pendingPayments: number;
  reviewsTotal: number;
  reviews7d: number;
  lists: number;
  circles: number;
}

export interface AdminActivityEvent {
  type: "user" | "review" | "payment" | "course";
  title: string;
  detail?: string;
  createdAt: string;
}

export interface AdminReviewRow {
  id: string;
  body: string;
  containsSpoilers: boolean;
  createdAt: string;
  author: { id: string; name: string; email: string; avatarUrl: string | null };
  course: { id: string; slug: string; title: string; thumbnailUrl: string | null };
  replyCount: number;
  upvoteCount: number;
}

export interface AdminPaymentRow {
  id: string;
  planName: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  status: string;
  txReference: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; telegramUsername: string | null };
  references: { id: string; reference: string; verified: boolean; submittedAt: string }[];
}

export interface AdminLecturerRow {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  credentials: string | null;
  courseCount: number;
  createdAt: string;
}

export interface AdminPublisherRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  orgType: string;
  description: string | null;
  subscribers: number;
  courseCount: number;
  createdAt: string;
}

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  coverImage: string | null;
  sortOrder: number;
  courseCount: number;
  createdAt: string;
}

/**
 * Resources — cheat-sheets, roadmaps and notes.
 *
 * Short published artefacts rather than something you work through, so they
 * carry a body and an attachment list where a course carries a curriculum.
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

export interface AdminResourceRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  summary: string | null;
  coverUrl: string | null;
  isPremium: boolean;
  isFeatured: boolean;
  viewCount: number;
  downloadCount: number;
  mediaCount: number;
  isEmpty: boolean;
  categoryName: string | null;
  categoryIcon: string | null;
  lecturerName: string | null;
  organizationName: string | null;
  tags: string[];
  publishedAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AdminResourceMedia {
  id?: string;
  kind: ResourceMediaKind;
  url: string;
  fileName: string;
  fileSizeMb: number | null;
  caption: string;
  orderIndex?: number;
}

export interface AdminResourceDetail {
  id: string;
  type: string;
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  coverUrl: string | null;
  categoryName: string;
  lecturerName: string;
  organizationName: string;
  tags: string[];
  isPremium: boolean;
  isFeatured: boolean;
  sourceUrl: string;
  readMinutes: number;
  viewCount: number;
  downloadCount: number;
  publishedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  media: AdminResourceMedia[];
}

/** A published legal document, as served by the public GET /legal. */
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

export interface AdminLegalRow {
  id: string;
  type: string;
  title: string;
  customTitle: string | null;
  version: string;
  bodyMd: string;
  changeSummary: string | null;
  requiresAcceptance: boolean;
  effectiveAt: string;
  updatedAt: string;
  updatedBy: string | null;
  acceptedCurrent: number;
  acceptedAnyVersion: number;
  eligibleUsers: number;
}

export interface AdminLesson {
  id?: string;
  title: string;
  type: string;
  durationSec: number;
  videoUrl: string | null;
  isPreview: boolean;
  fileUrl?: string | null;
  fileLabel?: string | null;
  fileSizeMb?: number | null;
}

export interface AdminSection {
  id?: string;
  title: string;
  lessons: AdminLesson[];
}

export interface AdminCourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryNames: string[];
  levelName: string | null;
  lecturerName: string | null;
  organizationName: string | null;
  language: string;
  originalPrice: number | null;
  price: number | null;
  isPremium: boolean;
  isFeatured: boolean;
  contentType: string;
  tags: string[];
  audience: string[];
  prerequisites: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  previewVideoUrl: string | null;
  sections: AdminSection[];
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
  hasGoogle: boolean;
  hasPassword: boolean;
  pendingPayment: { id: string; planName: string; paymentMethod: string; amount: number } | null;
  settings: { autoplayNext?: boolean; previewAutoplay?: boolean } | null;
  privacy: Record<string, string> | null;
  stats: { downloaded: number; saved: number; liked: number; lists: number; reviews: number };
  sessions: { id: string; device: string | null; ip: string | null; active: boolean; createdAt: string }[];
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

// --- Telegram bridge (admin) ------------------------------------------------

export interface AdminTelegramFile {
  id: string;
  fileName: string | null;
  fileSizeMb: number | null;
  partIndex: number;
  chatUsername: string | null;
  messageId: string;
  hasFileId: boolean;
  createdAt: string;
}

/** Files parsed into modules by filename, the way the bot delivers them. */
export interface AdminTelegramModule {
  title: string | null;
  order: number;
  sizeMb: number;
  files: AdminTelegramFile[];
}

export interface AdminTelegramConsole {
  configured: boolean;
  online: boolean;
  username: string | null;
  error: string | null;
  courses: number;
  linkedFiles: number;
  pairedUsers: number;
  downloads: number;
  recent: { at: string; kind: string; detail: string }[];
  /** Whether *this* operator's account is bound to a Telegram user. */
  paired: boolean;
  telegramUsername: string | null;
  pairingLink: string;
  forwarded: { fileName: string | null; fileSizeMb: number | null; at: string } | null;
}

export interface AdminTelegramImportResult {
  files: number;
  created: number;
  updated: number;
  skipped: number;
  unreadable: number;
  totalMb: number;
  modules: { title: string; parts: number }[];
}

export interface AdminTelegramAttachResult {
  attached: boolean;
  created: boolean;
  fileName: string | null;
  fileSizeMb: number | null;
}
