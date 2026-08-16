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
  downloads: { total: number; last30: number; last7: number; today: number };
}

export interface HomeData {
  trending: CourseSummary[];
  latest: CourseSummary[];
  topRated: CourseSummary[];
  bestOf: { id: string; name: string; slug: string; logoUrl: string | null; courseCount: number; courses: CourseSummary[] }[];
  featuredPaths: { id: string; title: string; description: string; coverUrl: string | null; courseCount: number; ratingAvg: number; totalVotes: number }[];
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
  attachments: { id: string; fileUrl: string; fileType: string; sizeMb: number }[];
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

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  priceEtb: number;
  priceUsd: number;
  weeklyEtb: number;
  isBestValue: boolean;
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
  stats: { enrolled: number; completed: number; saved: number; liked: number; lists: number; reviews: number };
  sessions: { id: string; device: string | null; ip: string | null; active: boolean; createdAt: string }[];
}
