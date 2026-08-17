"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiUrl, post, setToken } from "@/lib/api";

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // forgot-password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

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

  const sendForgot = async () => {
    setForgotBusy(true);
    setForgotMsg("");
    try {
      await post("/auth/forgot-password", { email: forgotEmail });
      setForgotMsg("If that email exists, a reset link is on its way. Check your inbox (and spam).");
    } catch (e: any) {
      setForgotMsg(e.message ?? "Could not send reset email");
    } finally {
      setForgotBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none";

  return (
    <main className="auth-screen">
      {/* left — hero image + headline (desktop) */}
      <div className="auth-hero desktop-only">
        <div className="brand" style={{ position: "absolute", top: 28, left: 32 }}>
          sync<i />ourse
        </div>
        <div className="auth-hero-copy">
          <h1>Your go-to place for courses.</h1>
          <p>Trending picks, full curricula, instructor-led tracks — discover what to learn next.</p>
        </div>
      </div>

      {/* right — floating auth card */}
      <div className="auth-panel">
        <div className="mobile-only" style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="brand" style={{ fontSize: 28 }}>sync<i />ourse</div>
        </div>

        <div className="auth-card">
          <h2 className="display" style={{ fontSize: 24, margin: "0 0 4px" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 20px" }}>
            Use the same account on web and mobile — ratings, lists and learning history come with you.
          </p>

          <div className="space-y-3">
            {mode === "register" && (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputClass} />
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputClass} />
              </>
            )}
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={inputClass} />

            {/* password with visibility toggle */}
            <div style={{ position: "relative" }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Password (min 8 characters)"
                className={inputClass}
                style={{ paddingRight: 42 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="auth-eye"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: -4 }}>
                <button onClick={() => setForgotOpen(true)} className="link-btn">
                  Forgot password?
                </button>
              </div>
            )}

            {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

            <button
              onClick={submit}
              disabled={busy || !email || !password || (mode === "register" && (!name || !username))}
              className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "One sec…" : mode === "login" ? "Sign in" : "Create account"}
            </button>

            <div className="auth-divider">or</div>

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

            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="w-full text-center text-xs text-muted hover:text-text"
            >
              {mode === "login" ? "No account yet? Create one" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>

      {/* forgot-password modal */}
      {forgotOpen && (
        <div className="sheet" onClick={() => setForgotOpen(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>Reset password</h2>
              <button className="icon-btn" onClick={() => setForgotOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
              Enter the email you signed up with and we&apos;ll send a reset link.
            </p>
            <input
              className="form-input"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
            />
            <button className="btn primary" style={{ width: "100%", marginTop: 14 }} onClick={sendForgot} disabled={forgotBusy || !forgotEmail}>
              {forgotBusy ? "Sending…" : "Send reset link"}
            </button>
            {forgotMsg && (
              <div className="muted" style={{ marginTop: 12, fontSize: 12, color: forgotMsg.includes("way") ? "#6fe0a4" : "hsl(var(--destructive))" }}>
                {forgotMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}
