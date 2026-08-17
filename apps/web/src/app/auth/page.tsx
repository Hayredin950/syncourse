"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiUrl, setToken } from "@/lib/api";

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { login, register, refresh } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Google OAuth bounce-back: the API redirects here with ?token=...
  useEffect(() => {
    const token = params.get("token");
    if (!token) return;
    setToken(token);
    setGoogleBusy(true);
    void refresh()
      .catch(() => undefined)
      .finally(() => router.replace(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const startGoogle = () => {
    setGoogleBusy(true);
    const current = window.location.origin + window.location.pathname;
    const redirect = `${current}${window.location.search || `?next=${encodeURIComponent(next)}`}`;
    window.location.href = `${apiUrl()}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(email, password);
      else await register(name, username, email, password);
      router.push(next);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col justify-center px-6">
      <div className="text-center">
        <div className="text-2xl font-bold text-text">
          Syncourse<span className="text-accent">.</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Use the same account on web and mobile. Your ratings, lists and learning history come with you.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {mode === "register" && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
            />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
            />
          </>
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password (min 8 characters)"
          className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
        />

        {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

        <button
          onClick={submit}
          disabled={busy || !email || !password || (mode === "register" && (!name || !username))}
          className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "One sec…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          onClick={startGoogle}
          disabled={googleBusy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="w-full text-center text-xs text-muted hover:text-text">
          {mode === "login" ? "No account yet? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}
