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
  enrollmentCount: number;
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
  /** progress percentage — present on learning rows (my-learning) */
  progress?: number;
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
  body: string;
  containsSpoilers: boolean;
  editedAt: string | null;
  createdAt: string;
  replyCount: number;
  upvotes?: number;
  upvoted?: boolean;
  replies?: ReviewRow[];
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
    enrollmentCount: number;
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
    enrollmentCount: number;
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
  watched: boolean;
  courseProgress: number;
}

export interface LearningData {
  inProgress: { id: string; title: string; slug: string; thumbnailUrl: string | null; level: string; ratingAvg: number; progressPct: number; status: string }[];
  completed: { id: string; title: string; slug: string; thumbnailUrl: string | null; ratingAvg: number }[];
  watchlist: { id: string; title: string; slug: string; thumbnailUrl: string | null; ratingAvg: number; savedAt: string }[];
  liked: { id: string; title: string; slug: string; thumbnailUrl: string | null; ratingAvg: number }[];
  counts: { inProgress: number; completed: number; watchlist: number; liked: number };
}

export interface CircleLite {
  id: string;
  name: string;
  description: string | null;
  owner: { name: string; avatarUrl: string | null; username: string };
  memberCount: number;
  joined: boolean;
  createdAt: string;
}

export interface CircleDetail extends CircleLite {
  members: { id: string; name: string; avatarUrl: string | null; username: string; role: string; joinedAt: string }[];
  activity: {
    type: "review" | "enrollment";
    id: string;
    userName: string;
    userAvatar: string | null;
    username: string;
    course: { id: string; title: string; slug: string; thumbnailUrl: string | null };
    body?: string;
    createdAt: string;
  }[];
}

export interface ActivityFeed {
  followingCount: number;
  items: {
    type: "review" | "enrollment";
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
  enrollmentCount: number;
  deleted: boolean;
  sectionCount: number;
  createdAt: string;
  updatedAt: string;
  level: string | null;
  lecturer: string | null;
  organization: string | null;
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
  stats: { enrolled: number; completed: number; saved: number; liked: number; lists: number; reviews: number };
  sessions: { id: string; device: string | null; ip: string | null; active: boolean; createdAt: string }[];
}

export interface UserStats {
  engagedTotal: number;
  ratingDistribution: { stars: number; count: number }[];
  monthlyCompleted: { month: string; count: number }[];
  categoryCounts: { label: string; count: number }[];
  instructorCounts: { label: string; count: number }[];
  languageCounts: { label: string; count: number }[];
  topInstructors: { name: string; count: number; photoUrl: string | null }[];
  contentTypeBreakdown: { label: string; count: number; pct: number }[];
  difficultyBreakdown: { label: string; count: number; pct: number }[];
  yourWeek: { day: string; count: number }[];
  watchlistGrowth: { month: string; count: number }[];
  topTags: { label: string; count: number }[];
  pathProgress: { id: string; title: string; coverUrl: string | null; enrolled: number; completed: number; total: number; pct: number }[];
  hasGoogle: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
}
