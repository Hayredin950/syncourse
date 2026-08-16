"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          onClick={() => setError("Google sign-in needs GOOGLE_CLIENT_ID — use email for now.")}
          className="w-full rounded-full border border-border py-2.5 text-sm font-medium text-text hover:bg-surface-hover"
        >
          Continue with Google
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
