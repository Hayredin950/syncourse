"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, get, post } from "@/lib/api";
import { MobileHeader } from "@/components/Nav";
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

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; answer: Answer };

/** Sent back to the API as context; the server keeps the last eight. */
interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Where should I start with AI agents?",
  "Which course teaches Flutter from scratch?",
  "How do I automate my business with n8n?",
  "What does the RAG course actually cover?",
];

const SCOPED_SUGGESTIONS = [
  "What does this course cover?",
  "What should I know before starting?",
  "Which lessons matter most?",
];

/** Follow-ups offered under an answer, so the thread keeps moving. */
const FOLLOW_UPS = ["Which one should I start with?", "What is the prerequisite?", "Show me the closest alternative"];

/** The kind label a reader understands, not the indexer's name for it. */
const KIND_LABEL: Record<string, string> = {
  subtitle: "transcript",
  pdf: "PDF notes",
  text: "notes",
  json: "workflow file",
  html: "page text",
  "entry-name": "file in the archive",
  lesson: "lesson",
};

const STORAGE_KEY = "syncourse.assistant.thread.v1";
const MAX_STORED_TURNS = 16;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 1_200;

interface StoredThread {
  courseSlug: string | null;
  turns: Turn[];
}

function readThread(): StoredThread | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredThread;
    if (!parsed || !Array.isArray(parsed.turns) || parsed.turns.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function AssistantPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState("");
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  /** The question a link handed us (`?q=`), sent once the status is known. */
  const bootQuestion = useRef<string | null>(null);
  /** A ref, because the composer can ask twice before React re-renders. */
  const pendingRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);

  const commitTurns = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  // `?q=` lets the search page and the course page hand a question over, and
  // `?course=` scopes the answer to one course. Read them from the location
  // rather than `useSearchParams`, which would force a Suspense boundary on a
  // page that has nothing to stream.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const course = params.get("course");
    const stored = q ? null : readThread();

    if (course) setCourseSlug(course);
    else if (stored?.courseSlug) setCourseSlug(stored.courseSlug);

    if (q) bootQuestion.current = q.slice(0, 500);
    else if (stored) commitTurns(stored.turns);

    get<Status>("/assistant/status")
      .then(setStatus)
      .catch(() =>
        setStatus({
          enabled: false,
          mode: "extractive",
          provider: null,
          model: null,
          dailyCap: { anonymous: 0, member: 0 },
        }),
      );
  }, [commitTurns]);

  useEffect(() => {
    if (turns.length === 0) textarea.current?.focus();
  }, [turns.length]);

  // Persist the thread for the tab. A reload should not lose a good answer,
  // and the server holds no session of its own.
  useEffect(() => {
    try {
      if (turns.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ courseSlug, turns: turns.slice(-MAX_STORED_TURNS) } satisfies StoredThread),
      );
    } catch {
      // Private mode or a full quota: a lost transcript is not an error.
    }
  }, [turns, courseSlug]);

  const ask = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length < 3 || pendingRef.current) return;

      pendingRef.current = true;
      setPending(true);
      setError(null);
      setFailedQuestion(null);
      setQuestion("");

      const history: HistoryTurn[] = turnsRef.current
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_HISTORY_CHARS) }));

      const userTurn: Turn = { role: "user", content: clean };
      commitTurns([...turnsRef.current, userTurn]);

      // Keep the latest question in the URL so a reload or a shared link
      // repeats it. The course scope stays until the reader clears it.
      const url = new URL(window.location.href);
      url.searchParams.set("q", clean);
      if (!courseSlug) url.searchParams.delete("course");
      window.history.replaceState(null, "", url);

      try {
        const answer = await post<Answer>("/assistant/ask", {
          question: clean,
          ...(courseSlug ? { courseSlug } : {}),
          ...(history.length > 0 ? { history } : {}),
        });
        commitTurns([...turnsRef.current, { role: "assistant", content: answer.answer, answer }]);
      } catch (err) {
        setFailedQuestion(clean);
        setError(
          err instanceof ApiError
            ? err.message
            : "The assistant is unreachable right now. Try again in a moment.",
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [commitTurns, courseSlug],
  );

  // A link that arrives with a question asks it once. Waiting for `/status`
  // keeps a disabled assistant from showing an avoidable error.
  useEffect(() => {
    if (!status || !bootQuestion.current) return;
    const q = bootQuestion.current;
    bootQuestion.current = null;
    if (status.enabled) void ask(q);
    else setError("The assistant is switched off right now. The search page still works.");
  }, [status, ask]);

  useEffect(() => {
    if (turns.length === 0) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  const disabled = status !== null && !status.enabled;

  const newChat = () => {
    commitTurns([]);
    setError(null);
    setFailedQuestion(null);
    setQuestion("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clean
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
    textarea.current?.focus();
  };

  /** Leave the course scope without losing the thread already on screen. */
  const clearScope = () => {
    setCourseSlug(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("course");
    window.history.replaceState(null, "", url);
  };

  return (
    <main className={styles.page}>
      <MobileHeader title="Assistant" />
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Study assistant</p>
              <h1 className={styles.title}>Ask the catalogue</h1>
            </div>
            {turns.length > 0 && (
              <button type="button" className={styles.newChat} onClick={newChat}>
                New chat
              </button>
            )}
          </div>
          <p className={styles.lede}>
            Answers are built from the lesson transcripts, PDFs and notes inside the courses — and every
            claim links back to the file it came from. When nothing matches, it says so instead of guessing.
          </p>
          {status && (
            <p className={styles.provenance}>
              {status.mode === "llm" ? (
                <>
                  Written by <strong>{status.provider}</strong> · <span>{status.model}</span>
                </>
              ) : (
                <>Answers are quoted straight from the catalogue, with no model in between.</>
              )}
            </p>
          )}
        </header>

        {courseSlug && (
          <div className={styles.scope}>
            <span>
              Answering inside{" "}
              <Link href={`/courses/${courseSlug}`} className={styles.inlineLink}>
                this course
              </Link>
            </span>
            <button type="button" className={styles.scopeClear} onClick={clearScope}>
              Ask the whole catalogue instead
            </button>
          </div>
        )}

        {turns.length === 0 && !pending && (
          <section className={styles.suggestions} aria-label="Example questions">
            {(courseSlug ? SCOPED_SUGGESTIONS : SUGGESTIONS).map((s) => (
              <button
                key={s}
                type="button"
                className={styles.chip}
                onClick={() => void ask(s)}
                disabled={disabled}
              >
                {s}
              </button>
            ))}
          </section>
        )}

        <section className={styles.thread} aria-live="polite" aria-busy={pending}>
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className={`${styles.turn} ${styles.turnUser}`}>
                <p className={styles.userText}>{turn.content}</p>
              </div>
            ) : (
              <AnswerCard key={i} answer={turn.answer} turnIndex={i} />
            ),
          )}

          {pending && (
            <div className={`${styles.turn} ${styles.turnAssistant}`}>
              <div className={styles.result}>
                <p className={styles.thinking}>
                  <span className={styles.dot} />
                  Reading the course transcripts…
                </p>
              </div>
            </div>
          )}
          <div ref={bottom} />
        </section>

        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
            {failedQuestion && (
              <button type="button" className={styles.retry} onClick={() => void ask(failedQuestion)}>
                Try again
              </button>
            )}
          </div>
        )}

        {turns.length > 0 && !pending && !error && (
          <div className={styles.followUps}>
            {FOLLOW_UPS.map((s) => (
              <button key={s} type="button" className={styles.chip} onClick={() => void ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <label className={styles.srOnly} htmlFor="assistant-question">
            {turns.length > 0 ? "Ask a follow-up" : "Your question"}
          </label>
          <textarea
            id="assistant-question"
            ref={textarea}
            className={styles.input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            rows={turns.length > 0 ? 2 : 3}
            maxLength={500}
            placeholder={turns.length > 0 ? "Ask a follow-up…" : "What do you want to learn or check?"}
            disabled={disabled}
          />
          <div className={styles.actions}>
            <span className={styles.meta}>
              {question.length}/500 · Enter to send · Shift + Enter for a new line
            </span>
            <button
              type="submit"
              className={styles.button}
              disabled={pending || disabled || question.trim().length < 3}
            >
              {pending ? "Reading…" : turns.length > 0 ? "Follow up" : "Ask"}
            </button>
          </div>
        </form>

        <p className={styles.footerNote}>
          No luck? <Link href="/search" className={styles.inlineLink}>Search the whole catalogue</Link> or ask a
          different way — a tool name, a subject or a lecturer works best.
        </p>
      </div>
    </main>
  );
}

/**
 * One assistant turn. The answer text is rendered with its `[n]` references
 * turned into links to the matching source, so a claim and its evidence are one
 * gesture apart.
 */
function AnswerCard({ answer, turnIndex }: { answer: Answer; turnIndex: number }) {
  const citationFor = (n: number) => answer.citations.find((c) => c.index === n);

  return (
    <div className={`${styles.turn} ${styles.turnAssistant}`}>
      <div className={styles.result}>
        <div className={styles.answerHead}>
          <span className={styles.badge}>
            {answer.mode === "llm"
              ? `Written by ${answer.provider ?? "an AI model"}`
              : "Quoted from the catalogue"}
          </span>
          {answer.notice && <span className={styles.noticeInline}>{answer.notice}</span>}
        </div>

        <div className={styles.answer}>
          {answer.answer.split(/\n{2,}/).map((block, i) => (
            <p key={i}>{withCitationLinks(block, turnIndex, citationFor)}</p>
          ))}
        </div>

        {answer.citations.length > 0 && (
          <div className={styles.sources}>
            <h2 className={styles.h2}>Where this came from</h2>
            <ol className={styles.sourceList}>
              {answer.citations.map((c) => (
                <li key={`${c.courseId}-${c.index}`} id={`cite-${turnIndex}-${c.index}`} className={styles.source}>
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

        {answer.courses.length > 0 && (
          <div className={styles.courses}>
            <h2 className={styles.h2}>Courses to open</h2>
            <ul className={styles.courseList}>
              {answer.courses.map((c) => (
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
            {!answer.premiumActive && answer.courses.some((c) => c.locked) && (
              <p className={styles.meta}>
                Premium courses are listed but their text is never quoted here.{" "}
                <Link href="/premium" className={styles.inlineLink}>
                  See plans
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** `[2]` becomes a link to source 2 of this turn; an orphan stays plain text. */
function withCitationLinks(
  text: string,
  turnIndex: number,
  citationFor: (n: number) => Citation | undefined,
): ReactNode[] {
  return text.split(/(\[\d{1,2}\])/g).map((part, i) => {
    const match = /^\[(\d{1,2})\]$/.exec(part);
    if (!match) return part;
    const n = Number(match[1]);
    const citation = citationFor(n);
    if (!citation) return part;
    return (
      <a key={i} href={`#cite-${turnIndex}-${n}`} className={styles.citeRef}>
        {part}
      </a>
    );
  });
}
