import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ActivityItem,
  AppVersion,
  Category,
  CourseCollection,
  CourseDetail,
  CourseSummary,
  DiscussionThread,
  HomeFeed,
  LearningPath,
  LecturerDetail,
  LessonDetail,
  MyLearning,
  NotificationItem,
  OrganizationDetail,
  Plan,
  Review,
  UserProfile,
} from "./types";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const TOKEN_KEY = "syncourse_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — continue without persistence
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(", ")
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });

// --- auth ---
export async function login(email: string, password: string) {
  const data = await post<{ accessToken: string }>("/auth/login", {
    email,
    password,
  });
  await setToken(data.accessToken);
}

export async function register(name: string, email: string, password: string) {
  const data = await post<{ accessToken: string }>("/auth/register", {
    name,
    email,
    password,
  });
  await setToken(data.accessToken);
}

export const googleExchange = (code: string, redirectUri: string) =>
  post<{ accessToken: string }>("/auth/google/exchange", { code, redirectUri });

export const logout = () => setToken(null);

// --- catalog ---
export const home = () => get<HomeFeed>("/home");

export const browse = (params: {
  sort?: string;
  category?: string;
  level?: string;
  minRating?: number;
  q?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.sort) qs.set("sort", params.sort);
  if (params.category) qs.set("category", params.category);
  if (params.level) qs.set("level", params.level);
  if (params.minRating) qs.set("minRating", String(params.minRating));
  if (params.q) qs.set("q", params.q);
  qs.set("limit", String(params.limit ?? 60));
  return get<{ total: number; results: CourseSummary[] }>(
    `/courses?${qs.toString()}`
  );
};

export const courseDetail = (slug: string) => get<CourseDetail>(`/courses/${slug}`);
export const lessonDetail = (lessonId: string) => get<LessonDetail>(`/lessons/${lessonId}`);
export const videoUrl = (lessonId: string) =>
  get<{ url: string; expiresAt: string }>(`/lessons/${lessonId}/video-url`);
export const fileUrl = (lessonId: string, attachmentId: string) =>
  get<{ url: string; expiresAt: string; fileName: string; fileType: string; sizeMb: number }>(
    `/lessons/${lessonId}/file-url?attachmentId=${attachmentId}`
  );

// --- learning ---
export const enroll = (slug: string) => post(`/courses/${slug}/enroll`);
export const toggleSave = (slug: string) => post(`/courses/${slug}/save`);
export const toggleLike = (slug: string) => post(`/courses/${slug}/like`);
export const markComplete = (lessonId: string) =>
  post(`/lessons/${lessonId}/progress`, { completed: true });
export const myLearning = () => get<MyLearning>("/me/learning");

// --- search ---
export const search = (q: string) =>
  get<{
    query: string;
    total: number;
    courses: CourseSummary[];
    lecturers: unknown[];
    organizations: unknown[];
    trending: string[];
  }>(`/search?q=${encodeURIComponent(q)}`);
export const trendingSearches = () =>
  get<{ trending: string[] }>("/search/trending");

// --- collections ---
export const myLists = () => get<CourseCollection[]>("/me/lists");
export const createList = (name: string) =>
  post<CourseCollection>("/lists", { name, visibility: "private" });
export const listDetail = (id: string) => get<CourseCollection>(`/lists/${id}`);

// --- payments ---
export const plans = () => get<Plan[]>("/payments/plans");
export const checkout = (planId: string, method: string) =>
  post<Record<string, unknown>>("/payments/checkout", {
    planId,
    method,
    currency: method === "telebirr" ? "ETB" : "USD",
  });

// --- circles ---
export const circlesActivity = () =>
  get<{ activity: ActivityItem[] }>("/circles/activity");

// --- users ---
export const me = () => get<UserProfile>("/users/me");
export const updateProfile = (data: { name?: string; gender?: string; avatarUrl?: string }) =>
  request<UserProfile>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
export const linkTelegram = (telegramUsername: string) =>
  post("/auth/link-telegram", { telegramUsername });
export const terminateSession = (sessionId: string) =>
  post(`/users/sessions/${sessionId}/terminate`);

export const recordDownload = (lessonId: string, quality?: string) =>
  post<{ id: string; recorded: boolean }>(`/lessons/${lessonId}/download`, quality ? { quality } : undefined);

// --- catalog extras ---
export const categories = () => get<Category[]>("/categories");
export const lecturerDetail = (slug: string) => get<LecturerDetail>(`/lecturers/${slug}`);
export const organizationDetail = (slug: string) => get<OrganizationDetail>(`/organizations/${slug}`);
export const learningPaths = () => get<LearningPath[]>("/learning-paths");

// --- ratings & reviews ---
export const rateCourse = (slug: string, stars: number) =>
  post<{ ratingAvg: number }>(`/courses/${slug}/rate`, { stars });
export const postReview = (slug: string, body: string, containsSpoilers: boolean) =>
  post<Review>(`/courses/${slug}/reviews`, { body, containsSpoilers });

// --- images (Cloudinary) + course covers ---
export const uploadImage = (input: { dataUrl?: string; imageUrl?: string }) =>
  post<{ url: string; publicId: string }>("/images/upload", input);

export const setCourseCover = (slug: string, thumbnailUrl: string, bannerUrl?: string) =>
  post<{ slug: string; thumbnailUrl: string | null; bannerUrl: string | null }>(`/admin/courses/${slug}/cover`, {
    thumbnailUrl,
    ...(bannerUrl ? { bannerUrl } : {}),
  });

// --- discussion threads ---
export const discussion = (slug: string) =>
  get<{ courseId: string; total: number; threads: DiscussionThread[] }>(
    `/courses/${slug}/discussion`
  );
export const postDiscussion = (slug: string, body: string, parentId?: string) =>
  post<DiscussionThread>(`/courses/${slug}/discussion`, {
    body,
    ...(parentId ? { parentId } : {}),
  });
export const toggleUpvote = (reviewId: string) =>
  post<{ upvoted: boolean; upvotes: number }>(`/discussion/${reviewId}/upvote`);

// --- notifications & changelog ---
export const notifications = () =>
  get<{ unread: number; notifications: NotificationItem[] }>("/notifications");
export const markNotificationsRead = () => post("/notifications/read");
export const sendReminder = (title: string, body: string) =>
  post("/notifications/send", {
    type: "telegram_reminder",
    title,
    body,
  });
export const appVersions = () => get<AppVersion[]>("/app-versions");
