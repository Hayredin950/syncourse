"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, User, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import Modal from "@/components/Modal";
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

  // email verification (hard verify: sign-in blocked until confirmed)
  const [verifying, setVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [resendBusy, setResendBusy] = useState(false);

  // Password recovery. Steps through email -> 6-digit code -> new password.
  // A code rather than a magic link: typing six digits is far more reliable than
  // a link tap, especially on phones where the link often lands in spam.
  const [resetStep, setResetStep] = useState<"hidden" | "email" | "otp" | "password">("hidden");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

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
      else if (await register(name, username, email, password)) {
        setVerifying(true);
        setVerifyEmail(email);
        setVerifyMsg("We emailed you a 6-digit code. Enter it below to finish creating your account.");
        setBusy(false);
        return;
      }
      router.push(next);
    } catch (e: any) {
      if (e?.status === 403) {
        setVerifying(true);
        setVerifyEmail(email);
        setVerifyMsg("Please confirm your email with the 6-digit code we sent you.");
        setError("");
      } else {
        setError(e.message || "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setError("");
    setVerifyMsg("");
    try {
      const res = await post<{ accessToken: string }>("/auth/verify", {
        email: verifyEmail,
        code: verifyCode,
      });
      setToken(res.accessToken);
      await refresh();
      router.push(next);
    } catch (e: any) {
      setError(e.message || "Could not verify the code");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setResendBusy(true);
    setError("");
    setVerifyMsg("");
    try {
      await post("/auth/resend-verification", { email: verifyEmail });
      setVerifyMsg("A new code is on its way — check your inbox (and spam).");
    } catch (e: any) {
      setError(e.message || "Could not resend the code");
    } finally {
      setResendBusy(false);
    }
  };

  const openReset = () => {
    setResetStep("email");
    setResetEmail(email);
    setResetOtp("");
    setNewPassword("");
    setResetToken("");
    setResetMsg("");
    setResetErr("");
  };

  const closeReset = () => {
    setResetStep("hidden");
    setResetOtp("");
    setNewPassword("");
    setResetToken("");
    setResetMsg("");
    setResetErr("");
  };

  /** Step 1 — ask for a code. */
  const requestReset = async () => {
    setResetBusy(true);
    setResetErr("");
    setResetMsg("");
    try {
      await post("/auth/forgot-password", { email: resetEmail });
      setResetStep("otp");
      setResetMsg("If that account exists, a 6-digit code is on its way. Check your inbox (and spam).");
    } catch (e: any) {
      setResetErr(e.message ?? "Could not send the reset code");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 2 — trade the code for a short-lived token. */
  const verifyResetOtp = async () => {
    setResetBusy(true);
    setResetErr("");
    setResetMsg("");
    try {
      const res = await post<{ resetToken: string }>("/auth/verify-reset", {
        email: resetEmail,
        code: resetOtp,
      });
      setResetToken(res.resetToken);
      setResetStep("password");
    } catch (e: any) {
      setResetErr(e.message ?? "That code was not accepted");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 3 — set the new password, then sign straight in with it. */
  const saveNewPassword = async () => {
    setResetBusy(true);
    setResetErr("");
    setResetMsg("");
    try {
      await post("/auth/reset-password", { token: resetToken, password: newPassword });
      // Signing in here saves the user retyping what they just chose. If it
      // fails for any reason the reset still succeeded, so fall back to the form.
      try {
        await login(resetEmail, newPassword);
        closeReset();
        router.push(next);
        return;
      } catch {
        closeReset();
        setMode("login");
        setEmail(resetEmail);
        setPassword("");
        setError("Password updated — sign in with your new password.");
      }
    } catch (e: any) {
      setResetErr(e.message ?? "Could not update the password");
    } finally {
      setResetBusy(false);
    }
  };

  /** Back to step 1 for a fresh code; the API rate-limits this to one a minute. */
  const resendReset = async () => {
    setResetBusy(true);
    setResetErr("");
    setResetMsg("");
    try {
      await post("/auth/forgot-password", { email: resetEmail });
      setResetOtp("");
      setResetMsg("A new code is on its way — check your inbox (and spam).");
    } catch (e: any) {
      setResetErr(e.message ?? "Could not resend the code");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      {/* left — hero image + headline (desktop) */}
      <div className="auth-hero desktop-only">
        <div className="brand" style={{ position: "absolute", top: 28, left: 32 }}>
          sync<i />ourse
        </div>
        <div className="auth-hero-copy">
          {/* Marketing copy, not the page title — and this whole column is
              `desktop-only`, so as an <h1> it left every phone with none. The
              heading on the card is the <h1> now. */}
          <p className="auth-hero-copy__lead">Your go-to place for courses.</p>
          <p>Trending picks, full curricula, instructor-led tracks — discover what to learn next.</p>
        </div>
      </div>

      {/* right — floating auth card */}
      <div className="auth-panel">
        <div className="mobile-only" style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="brand" style={{ fontSize: 28 }}>sync<i />ourse</div>
        </div>

        <div className="auth-card">
          <h1 className="display" style={{ fontSize: 24, margin: "0 0 4px" }}>
            {verifying ? "Check your email" : mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 20px" }}>
            {verifying
              ? "A 6-digit code was sent to your email. It expires in 15 minutes."
              : "Use the same account on web and mobile — ratings, lists and learning history come with you."}
          </p>

          {verifying ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void confirmCode();
              }}
            >
              <div className="muted" style={{ fontSize: 13, wordBreak: "break-all" }}>{verifyEmail}</div>
              <div className="auth-input">
                <Mail size={15} />
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="6-digit code"
                  autoFocus
                  style={{ letterSpacing: 6, fontWeight: 700 }}
                />
              </div>
              {verifyMsg && <div className="muted" style={{ fontSize: 12, color: "var(--success-ink)" }}>{verifyMsg}</div>}
              {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
              <button
                type="submit"
                disabled={busy || verifyCode.length !== 6}
                className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-hover disabled:opacity-40"
              >
                {busy ? "Checking…" : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={resendCode}
                disabled={resendBusy}
                className="w-full text-center text-xs text-muted hover:text-text"
              >
                {/* plain apostrophe: this is a JS string, not JSX text — &apos; would render literally */}
                {resendBusy ? "Sending…" : "Didn't get it? Resend the code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerifying(false);
                  setError("");
                  setVerifyMsg("");
                }}
                className="w-full text-center text-xs text-muted hover:text-text"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            /* A real <form>: Enter submits from any field, and the browser's
               password manager will offer to save what you typed. Without it,
               signing in needed a mouse. */
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
            {mode === "register" && (
              <>
                <div className="auth-input">
                  <User size={15} />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    autoComplete="name"
                    aria-label="Name"
                  />
                </div>
                <div className="auth-input">
                  <UserRound size={15} />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                    aria-label="Username"
                  />
                </div>
              </>
            )}
            <div className="auth-input">
              <Mail size={15} />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Email"
                autoComplete={mode === "login" ? "username" : "email"}
                aria-label="Email"
              />
            </div>

            {/* password with visibility toggle */}
            <div className="auth-input" style={{ position: "relative" }}>
              <Lock size={15} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Password (min 8 characters)"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-label="Password"
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
                <button type="button" onClick={openReset} className="link-btn">
                  Forgot password?
                </button>
              </div>
            )}

            {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

            <button
              type="submit"
              disabled={busy || !email || !password || (mode === "register" && (!name || !username))}
              className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "One sec…" : mode === "login" ? "Sign in" : "Create account"}
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
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
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="w-full text-center text-xs text-muted hover:text-text"
            >
              {mode === "login" ? "No account yet? Create one" : "Already have an account? Sign in"}
            </button>
            </form>
          )}
        </div>
      </div>

      {/* password recovery — email -> code -> new password, one panel per step.
          The three steps share one dialog rather than one each: the step counter in
          the header is the only thing that has to say where you are, and closing
          part-way through means the same thing at every step. */}
      {resetStep !== "hidden" && (
        <Modal
          open
          onClose={closeReset}
          title={
            resetStep === "email" ? "Reset password" : resetStep === "otp" ? "Enter your code" : "Choose a new password"
          }
          subtitle={`Step ${resetStep === "email" ? 1 : resetStep === "otp" ? 2 : 3} of 3`}
          width={420}
          footer={
            <div className="sheet-foot__row">
              {resetStep === "email" && (
                <button
                  type="button"
                  className="btn primary btn--grow"
                  onClick={requestReset}
                  disabled={resetBusy || !resetEmail}
                >
                  {resetBusy ? "Sending…" : "Send code"}
                </button>
              )}
              {resetStep === "otp" && (
                <button
                  type="button"
                  className="btn primary btn--grow"
                  onClick={verifyResetOtp}
                  disabled={resetBusy || resetOtp.length !== 6}
                >
                  {resetBusy ? "Checking…" : "Continue"}
                </button>
              )}
              {resetStep === "password" && (
                <button
                  type="button"
                  className="btn primary btn--grow"
                  onClick={saveNewPassword}
                  disabled={resetBusy || newPassword.length < 8}
                >
                  {resetBusy ? "Saving…" : "Save password"}
                </button>
              )}
            </div>
          }
        >
            {resetStep === "email" && (
              <>
                <p className="sheet-lead" style={{ marginBottom: 14 }}>
                  Enter the email you signed up with and we&apos;ll send you a 6-digit code.
                </p>
                <input
                  className="form-input"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && resetEmail && !resetBusy && void requestReset()}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-label="Email address"
                  autoFocus
                />
              </>
            )}

            {resetStep === "otp" && (
              <>
                <p className="sheet-lead" style={{ marginBottom: 14 }}>
                  We sent a 6-digit code to <b>{resetEmail}</b>. It expires in 15 minutes.
                </p>
                <input
                  className="form-input"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && resetOtp.length === 6 && !resetBusy && void verifyResetOtp()}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  style={{ letterSpacing: 8, textAlign: "center", fontSize: 20, fontWeight: 700 }}
                  aria-label="6-digit code"
                  autoFocus
                />
                <button className="link-btn" style={{ marginTop: 12 }} onClick={resendReset} disabled={resetBusy}>
                  {/* plain apostrophe: this is a JS string, not JSX text — &apos; would render literally */}
                  {resetBusy ? "Sending…" : "Didn't get it? Send another code"}
                </button>
              </>
            )}

            {resetStep === "password" && (
              <>
                <p className="sheet-lead" style={{ marginBottom: 14 }}>
                  Code confirmed. Choose a new password — this signs you out everywhere else.
                </p>
                <div style={{ position: "relative" }}>
                  <input
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newPassword.length >= 8 && !resetBusy && void saveNewPassword()}
                    type={showPassword ? "text" : "password"}
                    placeholder="New password (min 8 characters)"
                    autoComplete="new-password"
                    style={{ paddingRight: 42 }}
                    autoFocus
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
              </>
            )}

            {resetMsg && (
              <p className="sheet-note" role="status">
                {resetMsg}
              </p>
            )}
            {resetErr && (
              <p className="sheet-error" role="alert">
                {resetErr}
              </p>
            )}
        </Modal>
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
