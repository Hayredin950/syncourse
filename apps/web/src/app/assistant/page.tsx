"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, get, post } from "@/lib/api";
import styles from "./assistant.module.css";

interface Status {
  enabled: boolean;
  mode: "llm" | "extractive";
  provider: string | null;
  model: string | null;
  dailyCap: { anonymous: number; member: number };
}

interface Citation {
  index: number;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  kind: string;
  name: string;
  moduleTitle: string | null;
  snippet: string;
  url: string;
}

interface Answer {
  answer: string;
  mode: "llm" | "extractive";
  provider: string | null;
  notice: string | null;
  citations: Citation[];
  courses: Array<{
    id: string;
    title: string;
    slug: string;
    level: string;
    ratingAvg: number;
    isPremium: boolean;
    locked: boolean;
  }>;
  premiumActive: boolean;
}

const SUGGESTIONS = [
  "Where should I start with AI agents?",
  "Which course teaches Flutter from scratch?",
  "How do I automate my business with n8n?",
  "What does the RAG course actually cover?",
];

/** The kind label a reader understands, not the indexer's name for it. */
const KIND_LABEL: Record<string, string> = {
  subtitle: "transcript",
  pdf: "PDF notes",
  text: "notes",
  json: "workflow file",
  html: "page text",
  'entry-name': "file in the archive",
  lesson: "lesson",
};

export default function AssistantPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Answer | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // `?q=` lets the search page hand a query over; read it from the location
  // rather than `useSearchParams`, which would force a Suspense boundary on a
  // page that has nothing to stream.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuestion(q.slice(0, 500));
    get<Status>("/assistant/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, mode: "extractive", provider: null, model: null, dailyCap: { anonymous: 0, member: 0 } }));
  }, []);

  useEffect(() => {
    textarea.current?.focus();
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length < 3 || busy) return;
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const answer = await post<Answer>("/assistant/ask", { question: clean });
        setResult(answer);
        // Keep the question in the URL so a reload or a shared link repeats it.
        const url = new URL(window.location.href);
        url.searchParams.set("q", clean);
        window.history.replaceState(null, "", url);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "The assistant is unreachable right now. Try again in a moment.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const disabled = status !== null && !status.enabled;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Study assistant</p>
        <h1 className={styles.title}>Ask the catalogue</h1>
        <p className={styles.lede}>
          Answers are built from the lesson transcripts, PDFs and notes inside the courses — and every
          claim links back to the file it came from. When nothing matches, it says so instead of guessing.
        </p>
      </header>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label className={styles.label} htmlFor="assistant-question">
          Your question
        </label>
        <textarea
          id="assistant-question"
          ref={textarea}
          className={styles.input}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={3}
          maxLength={500}
          placeholder="What do you want to learn or check?"
          disabled={disabled}
        />
        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={busy || disabled || question.trim().length < 3}>
            {busy ? "Reading the courses…" : "Ask"}
          </button>
          <span className={styles.meta}>
            {question.length}/500 · Ctrl/⌘ + Enter
          </span>
        </div>
      </form>

      {disabled && (
        <p className={styles.notice}>
          The assistant is switched off right now. The search page still works.
        </p>
      )}

      {!result && !busy && (
        <section className={styles.suggestions} aria-label="Example questions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.chip}
              onClick={() => {
                setQuestion(s);
                void ask(s);
              }}
              disabled={disabled}
            >
              {s}
            </button>
          ))}
        </section>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className={styles.result} aria-live="polite">
          <div className={styles.answerHead}>
            <span className={styles.badge}>
              {result.mode === "llm" ? `Written by ${result.provider ?? "an AI model"}` : "Quoted from the catalogue"}
            </span>
            {result.notice && <span className={styles.notice}>{result.notice}</span>}
          </div>

          <div className={styles.answer}>
            {result.answer.split(/\n{2,}/).map((block, i) => (
              <p key={i}>{block}</p>
            ))}
          </div>

          {result.citations.length > 0 && (
            <div className={styles.sources}>
              <h2 className={styles.h2}>Where this came from</h2>
              <ol className={styles.sourceList}>
                {result.citations.map((c) => (
                  <li key={`${c.courseId}-${c.index}`} className={styles.source}>
                    <span className={styles.sourceIndex}>[{c.index}]</span>
                    <div>
                      <Link href={c.url} className={styles.sourceTitle}>
                        {c.courseTitle}
                      </Link>
                      <p className={styles.sourceWhere}>
                        {KIND_LABEL[c.kind] ?? c.kind}
                        {c.moduleTitle ? ` · ${c.moduleTitle}` : ""}
                        {c.name && !c.name.startsWith("entry:") ? ` · ${c.name}` : ""}
                      </p>
                      <p className={styles.snippet}>“{c.snippet}”</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.courses.length > 0 && (
            <div className={styles.courses}>
              <h2 className={styles.h2}>Courses to open</h2>
              <ul className={styles.courseList}>
                {result.courses.map((c) => (
                  <li key={c.id} className={styles.course}>
                    <Link href={`/courses/${c.slug}`} className={styles.courseLink}>
                      <span className={styles.courseTitle}>{c.title}</span>
                      <span className={styles.courseMeta}>
                        {c.level}
                        {c.ratingAvg > 0 ? ` · ${c.ratingAvg.toFixed(1)}★` : ""}
                        {c.locked ? " · premium" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!result.premiumActive && result.courses.some((c) => c.locked) && (
                <p className={styles.meta}>
                  Premium courses are listed but their text is never quoted here.{" "}
                  <Link href="/premium" className={styles.inlineLink}>
                    See plans
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <p className={styles.footerNote}>
        No luck? <Link href="/search" className={styles.inlineLink}>Search the whole catalogue</Link> or ask a
        different way — a tool name, a subject or a lecturer works best.
      </p>
    </main>
  );
}
