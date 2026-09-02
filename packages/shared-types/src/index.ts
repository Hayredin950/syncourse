/**
 * Shared types for Syncourse — consumed by both the NestJS API and the
 * Next.js web app (and mirrored in Flutter's models).
 * These mirror the data model in the spec (B.7).
 */

export type Level = "beginner" | "intermediate" | "advanced" | "all-levels";

export type LessonType = "video" | "article" | "quiz" | "notes";

export type ContentType = "course" | "mini-course" | "cheat-sheet" | "roadmap";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  coverImage: string | null;
  sortOrder: number;
}

export interface Lecturer {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bio: string | null;
  credentials: string | null;
  socialLinks: Record<string, string>;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  subscribers: number;
}

export interface Note {
  id: string;
  lessonId: string;
  courseId: string;
  title: string;
  richText: string;
  imageUrls: string[];
  pdfUrl: string | null;
  isCheatsheet: boolean;
}

export interface LessonFile {
  id: string;
  label: string; // "1080p" | "720p" | "notes_pdf" ...
  format: string; // mp4 | mkv | pdf
  sizeMb: number;
  durationSec: number;
  codec: string | null;
  hasSubtitles: boolean;
  audio: string | null;
  isBest: boolean;
}

export interface Lesson {
  id: string;
  courseId: string;
  sectionId: string | null;
  title: string;
  orderIndex: number;
  durationSec: number;
  type: LessonType;
  videoUrl: string | null;
  sourceUrl: string | null; // t.me message link for this lesson/part — set by feed ingestion
  isPreview: boolean;
  notes: Note[];
  files: LessonFile[];
}

export interface Section {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  lessons: Lesson[];
}

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  level: Level;
  durationMin: number;
  lessonCount: number;
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  isPremium: boolean;
  isFeatured: boolean;
  isNew: boolean;
  categoryNames: string[];
  lecturerName: string | null;
  organizationName: string | null;
  publishedAt: string;
}

export interface CourseDetail extends CourseSummary {
  bannerUrl: string | null;
  previewVideoUrl: string | null;
  sourceUrl: string | null; // where the course content lives (e.g. t.me link) — set by feed ingestion
  language: string;
  originalPrice: number | null;
  price: number | null;
  tags: string[];
  audience: string[];
  prerequisites: string | null;
  lecturer: Lecturer | null;
  organization: Organization | null;
  categories: Category[];
  sections: Section[];
}

export interface Review {
  id: string;
  courseId: string;
  userName: string;
  userAvatar: string | null;
  rating: number;
  body: string;
  containsSpoilers: boolean;
  editedAt: string | null;
  createdAt: string;
  replyCount: number;
  isStaff: boolean;
}

export interface CollectionList {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  savesCount: number;
  itemCount: number;
  ownerName: string;
  createdAt: string;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  watchedCount: number;
  progressPct: number;
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
  planType: "free" | "premium";
  planExpiresAt: string | null;
  telegramUsername: string | null;
  memberSince: string;
  stats: {
    downloaded: number;
    saved: number;
    liked: number;
    lists: number;
    reviews: number;
  };
}

export interface SearchResult {
  courses: CourseSummary[];
  lecturers: Lecturer[];
  organizations: Organization[];
  trending: string[];
  total: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export const PLANS: Plan[] = [
  { id: "1m", name: "1 Month", durationDays: 30, priceEtb: 149, priceUsd: 1.99, weeklyEtb: 35, isBestValue: false },
  { id: "3m", name: "3 Months", durationDays: 90, priceEtb: 349, priceUsd: 3.99, weeklyEtb: 27, isBestValue: false },
  { id: "6m", name: "6 Months", durationDays: 182, priceEtb: 549, priceUsd: 5.99, weeklyEtb: 21, isBestValue: true },
];
