import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ActivityItem,
  CourseCollection,
  CourseDetail,
  CourseSummary,
  HomeFeed,
  LessonDetail,
  MyLearning,
  Plan,
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

export const logout = () => setToken(null);

// --- catalog ---
export const home = () => get<HomeFeed>("/home");

export const browse = (params: {
  sort?: string;
  category?: string;
  level?: string;
  q?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.sort) qs.set("sort", params.sort);
  if (params.category) qs.set("category", params.category);
  if (params.level) qs.set("level", params.level);
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
