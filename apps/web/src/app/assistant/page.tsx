"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
  | { role: "assistant"; content: string; answer?: Answer; proposal?: Proposal; action?: ActionResult };

/** A write the assistant is asking permission to perform. */
interface Proposal {
  kind: string;
  summary: string;
  token: string | null;
  reply?: string;
}

interface ActionResult {
  ok: boolean;
  message: string;
  url?: string;
}

/** What the admin "Actions" mode accepts. Shown as examples, not a form. */
const ACTION_SUGGESTIONS = [
  'create course "Flutter Bootcamp" by Stephen Grider',
  "create resource Figma shortcuts | 40 keyboard shortcuts | cheat-sheet",
  "publish draft ab12cd34",
];

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
  const { user } = useAuth();
  const canAct = Boolean(user?.isStaff);
  const [mode, setMode] = useState<"ask" | "do">("ask");
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

  /**
   * Ask the write path for a proposal. Nothing is written here: the response is
   * a summary and a signed token, and only `confirmAction` spends it.
   */
  const propose = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length < 3 || pendingRef.current) return;

      pendingRef.current = true;
      setPending(true);
      setError(null);
      setFailedQuestion(null);
      setQuestion("");
      commitTurns([...turnsRef.current, { role: "user", content: clean }]);

      try {
        const proposal = await post<Proposal>("/assistant/actions/propose", { instruction: clean });
        commitTurns([
          ...turnsRef.current,
          { role: "assistant", content: proposal.reply ?? proposal.summary, proposal },
        ]);
      } catch (err) {
        setFailedQuestion(clean);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not prepare that action. Check the syntax and try again.",
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [commitTurns],
  );

  /** Execute exactly the proposal the operator confirmed. */
  const confirmAction = useCallback(
    async (turnIndex: number, token: string) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      try {
        const result = await post<ActionResult>("/assistant/actions/confirm", { token });
        const cleared = turnsRef.current.map((turn, i) =>
          i === turnIndex && turn.role === "assistant" ? { ...turn, proposal: undefined } : turn,
        );
        commitTurns([...cleared, { role: "assistant", content: result.message, action: result }]);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "That action did not complete. Nothing was changed.",
        );
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [commitTurns],
  );

  const cancelAction = useCallback(
    (turnIndex: number) => {
      commitTurns(turnsRef.current.filter((_, i) => i !== turnIndex));
    },
    [commitTurns],
  );

  const run = useCallback(
    (text: string) => (mode === "do" && canAct ? propose(text) : ask(text)),
    [ask, canAct, mode, propose],
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
  const inputDisabled = mode === "do" ? !canAct : disabled;

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

        {courseSlug && mode === "ask" && (
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

        {canAct && (
          <div className={styles.modeBar}>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === "ask" ? styles.modeBtnOn : ""}`}
              onClick={() => setMode("ask")}
              aria-pressed={mode === "ask"}
            >
              Ask
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === "do" ? styles.modeBtnOn : ""}`}
              onClick={() => setMode("do")}
              aria-pressed={mode === "do"}
            >
              Add to catalogue
            </button>
            <span className={styles.modeHint}>
              {mode === "do"
                ? "Writes ask for confirmation first."
                : "Read-only answers from the catalogue."}
            </span>
          </div>
        )}

        {turns.length === 0 && !pending && (
          <section className={styles.suggestions} aria-label="Example questions">
            {(mode === "do" && canAct
              ? ACTION_SUGGESTIONS
              : courseSlug
                ? SCOPED_SUGGESTIONS
                : SUGGESTIONS
            ).map((s) => (
              <button
                key={s}
                type="button"
                className={styles.chip}
                onClick={() => void run(s)}
                disabled={mode === "ask" && disabled}
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
              <AssistantTurn
                key={i}
                turn={turn}
                turnIndex={i}
                onConfirm={confirmAction}
                onCancel={cancelAction}
              />
            ),
          )}

          {pending && (
            <div className={`${styles.turn} ${styles.turnAssistant}`}>
              <div className={styles.result}>
                <p className={styles.thinking}>
                  <span className={styles.dot} />
                  {mode === "do" ? "Checking what that would write…" : "Reading the course transcripts…"}
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

        {turns.length > 0 && !pending && !error && mode === "ask" && (
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
            void run(question);
          }}
        >
          <label className={styles.srOnly} htmlFor="assistant-question">
            {mode === "do" ? "What should I add?" : turns.length > 0 ? "Ask a follow-up" : "Your question"}
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
                void run(question);
              }
            }}
            rows={turns.length > 0 ? 2 : 3}
            maxLength={mode === "do" ? 600 : 500}
            placeholder={
              mode === "do"
                ? 'create course "Title" by Instructor'
                : turns.length > 0
                  ? "Ask a follow-up…"
                  : "What do you want to learn or check?"
            }
            disabled={inputDisabled}
          />
          <div className={styles.actions}>
            <span className={styles.meta}>
              {mode === "do"
                ? "Writes are confirmed before they run"
                : `${question.length}/500 · Enter to send · Shift + Enter for a new line`}
            </span>
            <button
              type="submit"
              className={styles.button}
              disabled={pending || inputDisabled || question.trim().length < 3}
            >
              {pending ? (mode === "do" ? "Preparing…" : "Reading…") : mode === "do" ? "Prepare" : turns.length > 0 ? "Follow up" : "Ask"}
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
 * One assistant turn. Answers keep their sources; a write proposal is a card
 * with Confirm/Cancel, and a completed write is a short receipt.
 */
function AssistantTurn({
  turn,
  turnIndex,
  onConfirm,
  onCancel,
}: {
  turn: Extract<Turn, { role: "assistant" }>;
  turnIndex: number;
  onConfirm: (turnIndex: number, token: string) => void;
  onCancel: (turnIndex: number) => void;
}) {
  if (turn.answer) return <AnswerCard answer={turn.answer} turnIndex={turnIndex} />;

  if (turn.action) {
    return (
      <div className={`${styles.turn} ${styles.turnAssistant}`}>
        <div className={styles.result}>
          <div className={styles.answerHead}>
            <span className={styles.badge}>Done</span>
          </div>
          <p className={styles.answer}>{turn.action.message}</p>
          {turn.action.url && (
            <Link href={turn.action.url} className={styles.inlineLink}>
              Open it →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (turn.proposal) {
    return (
      <div className={`${styles.turn} ${styles.turnAssistant}`}>
        <div className={styles.result}>
          <div className={styles.answerHead}>
            <span className={styles.badge}>{turn.proposal.token ? "Needs confirmation" : "How to phrase it"}</span>
          </div>
          <p className={styles.answer} style={{ whiteSpace: "pre-wrap" }}>
            {turn.proposal.token ? turn.proposal.summary : turn.proposal.reply}
          </p>
          {turn.proposal.token && (
            <>
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => onConfirm(turnIndex, turn.proposal!.token!)}
                >
                  Confirm
                </button>
                <button type="button" className={styles.ghostButton} onClick={() => onCancel(turnIndex)}>
                  Cancel
                </button>
              </div>
              <p className={styles.meta}>
                Nothing is written until you confirm. The confirmation expires in 10 minutes.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.turn} ${styles.turnAssistant}`}>
      <div className={styles.result}>
        <div className={styles.answer}>
          <p>{turn.content}</p>
        </div>
      </div>
    </div>
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
