const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function apiUrl(): string {
  return API_URL;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("syncourse_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("syncourse_token", token);
  else localStorage.removeItem("syncourse_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  const text = await res.text();
  // A proxy or a hosting error page is HTML, not JSON. Parsing it blindly
  // turned a 502 into "Unexpected token '<'" instead of the real status.
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError(res.status, "The server returned an unreadable response");
    }
  }
  // An expired/revoked token used to leave every page on "Something went wrong
  // (401)" with no way forward. If we sent a token and the server rejected it,
  // the session is over: drop it and send the reader to sign in, keeping the
  // current page as the return target. Login failures never reach this branch
  // because they carry no token.
  if (res.status === 401 && token && typeof window !== "undefined") {
    setToken(null);
    const here = window.location.pathname + window.location.search;
    if (!here.startsWith("/auth")) {
      window.location.assign(`/auth?next=${encodeURIComponent(here)}`);
    }
  }
  if (!res.ok) {
    const message =
      data?.message && typeof data.message === "string"
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(", ")
          : `Something went wrong (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// convenience helpers
export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
