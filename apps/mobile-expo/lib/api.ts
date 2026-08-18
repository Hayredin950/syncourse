import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ActivityFeed,
  ActivityItem,
  AppVersion,
  Category,
  CheckoutResult,
  CircleDetail,
  CircleLite,
  CourseCollection,
  CourseDetail,
  CourseSummary,
  DiscussionThread,
  HomeFeed,
  LearningPath,
  LearningPathDetail,
  Lecturer,
  LecturerDetail,
  Organization,
  OrganizationDetail,
  LessonDetail,
  MyLearning,
  NotificationItem,
  Plan,
  Review,
  UserProfile,
  UserStats,
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
    // Android's default OkHttp timeout is ~10s, but the Render free tier
    // can cold-start for 30-60s — give it a real chance instead of failing.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      res = await fetch(`${API_URL}/api${path}`, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const native =
      ((e as { cause?: { message?: string } })?.cause?.message as string) ||
      ((e as { cause?: unknown })?.cause as string) ||
      "";
    // Deep diagnostic: log the full error so we can read it from logcat.
    try {
      const err = e as Error & { cause?: unknown };
      console.log(
        "[net-diag] fetch failed",
        path,
        "url=", `${API_URL}/api${path}`,
        "message=", err?.message,
        "name=", err?.name,
        "cause=",
        typeof err?.cause === "string"
          ? err.cause
          : JSON.stringify(err?.cause ?? null),
        "stack=", err?.stack?.slice(0, 500),
      );
    } catch {
      /* logging must never break the app */
    }
    throw new ApiError(
      0,
      aborted
        ? "The server is waking up — please retry."
        : `Cannot reach the server. Check your connection.${native ? ` [${native}]` : ""}`,
    );
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
  lecturer?: string;
  organization?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.sort) qs.set("sort", params.sort);
  if (params.category) qs.set("category", params.category);
  if (params.level) qs.set("level", params.level);
  if (params.minRating) qs.set("minRating", String(params.minRating));
  if (params.q) qs.set("q", params.q);
  if (params.lecturer) qs.set("lecturer", params.lecturer);
  if (params.organization) qs.set("organization", params.organization);
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
export const createList = (input: { name: string; description?: string; visibility?: string }) =>
  post<CourseCollection>("/lists", {
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    visibility: input.visibility ?? "private",
  });
export const listDetail = (id: string) => get<CourseCollection>(`/lists/${id}`);

// --- payments ---
export const plans = () => get<Plan[]>("/payments/plans");
export const checkout = (planId: string, method: string) =>
  post<CheckoutResult>("/payments/checkout", {
    planId,
    method,
    currency: method === "telebirr" ? "ETB" : "USD",
  });
export const submitReference = (subscriptionId: string, reference: string) =>
  post<{ submitted: boolean; message: string }>(`/payments/subscriptions/${subscriptionId}/reference`, {
    reference,
  });

// --- circles ---
export const circlesActivity = () =>
  get<ActivityFeed>("/circles/activity");
export const circles = () => get<CircleLite[]>("/circles");
export const createCircle = (input: { name: string; description?: string }) =>
  post<CircleDetail>("/circles", input);
export const circleDetail = (id: string) => get<CircleDetail>(`/circles/${id}`);
export const joinCircle = (id: string) => post<{ joined: boolean }>(`/circles/${id}/join`);
export const leaveCircle = (id: string) => post<{ left: boolean }>(`/circles/${id}/leave`);
export const activityFeed = () => get<ActivityFeed>("/activity");

// --- users ---
export const me = () => get<UserProfile>("/users/me");
export const stats = () => get<UserStats>("/users/me/stats");
export const updateProfile = (data: { name?: string; username?: string; gender?: string; avatarUrl?: string }) =>
  request<UserProfile>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
export const linkTelegram = (telegramUsername: string) =>
  post("/auth/link-telegram", { telegramUsername });
export const terminateSession = (sessionId: string) =>
  post(`/users/sessions/${sessionId}/terminate`);
export const changePassword = (currentPassword: string, newPassword: string) =>
  post("/users/me/change-password", { currentPassword, newPassword });
export const forgotPassword = (email: string) =>
  post("/auth/forgot-password", { email });

export const recordDownload = (lessonId: string, quality?: string) =>
  post<{ id: string; recorded: boolean }>(`/lessons/${lessonId}/download`, quality ? { quality } : undefined);
export const downloadToTelegram = (lessonId: string) =>
  post<{ status: string; message: string }>(`/lessons/${lessonId}/download-to-telegram`);

// --- catalog extras ---
export const categories = () => get<Category[]>("/categories");
export const lecturers = () => get<Lecturer[]>("/lecturers");
export const organizations = () => get<Organization[]>("/organizations");
export const lecturerDetail = (slug: string) => get<LecturerDetail>(`/lecturers/${slug}`);
export const organizationDetail = (slug: string) => get<OrganizationDetail>(`/organizations/${slug}`);
export const learningPaths = () => get<LearningPath[]>("/learning-paths");
export const learningPath = (id: string) => get<LearningPathDetail>(`/learning-paths/${id}`);

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
