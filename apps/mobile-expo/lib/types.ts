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
  enrollmentCount: number;
  downloadCount: number;
  isPremium: boolean;
  isNew?: boolean;
  rank?: number;
  lecturerName?: string | null;
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
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface Review {
  id: string;
  userName: string;
  userAvatar: string | null;
  rating: number;
  body: string | null;
  containsSpoilers: boolean;
  createdAt: string;
  replyCount: number;
  isStaff: boolean;
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
  lecturer: Lecturer | null;
  organization: Organization | null;
  sections: Section[];
  ratings: { avg: number; count: number; distribution: Record<number, number> };
  reviews: Review[];
  downloads: { total: number; last30: number; last7: number; today: number };
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
  watched: boolean;
  courseProgress: number;
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
  stats: {
    enrolled: number;
    completed: number;
    saved: number;
    liked: number;
    lists: number;
    reviews: number;
  };
}

export interface HomeRail {
  title: string;
  slug: string;
  courses: CourseSummary[];
}

export interface HomeFeed {
  trending: CourseSummary[];
  latest: CourseSummary[];
  topRated: CourseSummary[];
  rails: HomeRail[];
}

export interface MyLearningItem {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  progressPct: number;
  status: string;
}

export interface MyLearning {
  inProgress: MyLearningItem[];
  completed: MyLearningItem[];
  watchlist: MyLearningItem[];
  liked: MyLearningItem[];
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
  items?: MyLearningItem[];
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

export interface ActivityItem {
  id: string;
  userName: string;
  verb: string;
  targetTitle: string;
  createdAt: string;
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
  courses: { id: string; title: string; slug: string; order: number }[];
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

export interface UserProfileFull extends UserProfile {
  sessions: Session[];
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
