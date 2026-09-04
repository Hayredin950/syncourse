"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import type { LessonDetail } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { SkRows } from "@/components/Skeleton";
import { formatSec } from "@/lib/format";
import { Toast } from "@/components/Toast";

// Static export: real lesson URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course", lessonId: "lesson" }];
}

export default function LessonPage() {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const router = useRouter();
  const { token } = useAuth();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  /** Separate from `!lesson`: a failed fetch left the skeleton running forever. */
  const [gone, setGone] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"watch" | "notes">("watch");
  const { toast, setToast } = useToast();
  const [videoError, setVideoError] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    get<LessonDetail>(`/lessons/${lessonId}`)
      .then(setLesson)
      .catch(() => setGone(true));
  }, [lessonId]);

  const loadVideo = async () => {
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${slug}/lessons/${lessonId}`));
      return;
    }
    try {
      const r = await get<{ url: string }>(`/lessons/${lessonId}/video-url`);
      setVideoUrl(r.url);
      setVideoError(false);
    } catch (e: any) {
      setVideoError(true);
      setToast(e.message || "Sign in to watch this lesson");
    }
  };

  const recordDownload = async (quality: string) => {
    if (!token) return;
    try {
      await post(`/lessons/${lessonId}/download`, { quality });
    } catch {
      /* non-fatal */
    }
  };

  /**
   * "Fast download" used to call `recordDownload` and nothing else: it counted a
   * download that never happened and the page said nothing back. These variant
   * rows carry no URL — they are metadata about files that live on Telegram — so
   * the only honest action is the one the bot performs. `/download-to-telegram`
   * records the event itself, and hands back a bot deep link when the account
   * has never opened the chat.
   */
  const sendToTelegram = async (label: string) => {
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${slug}/lessons/${lessonId}`));
      return;
    }
    setSending(label);
    try {
      const r = await post<{ sent: boolean; message: string; botUrl?: string }>(
        `/lessons/${lessonId}/download-to-telegram`,
        {},
      );
      setToast(r.message);
      if (r.botUrl) window.open(r.botUrl, "_blank", "noopener");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not reach Telegram — try again");
    } finally {
      setSending(null);
    }
  };

  const downloadFile = async (attachmentId: string, fileName: string) => {
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${slug}/lessons/${lessonId}`));
      return;
    }
    try {
      const r = await get<{ url: string; fileName: string }>(`/lessons/${lessonId}/file-url?attachmentId=${attachmentId}`);
      const a = document.createElement("a");
      a.href = r.url;
      a.download = r.fileName || fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setToast(`Downloading ${r.fileName || fileName}…`);
      void recordDownload(r.fileName || fileName);
    } catch (e: any) {
      setToast(e.message || "Download failed — sign in and try again");
    }
  };

  /**
   * Copies the lesson's own URL. It used to be labelled "IDM / 1DM", which
   * promised a direct file link — there isn't one, the files are on Telegram —
   * and it failed silently wherever `navigator.clipboard` is absent.
   */
  const copyLink = async () => {
    const url = `${window.location.origin}/courses/${slug}/lessons/${lessonId}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Lesson link copied");
    } catch {
      setToast("Couldn't copy — the address bar has the link");
    }
  };

  if (gone) {
    return (
      <main className="page" style={{ maxWidth: 860 }}>
        <div className="empty-state" style={{ marginTop: 30 }}>
          <div className="empty-icon">🔍</div>
          <p>This lesson isn&apos;t here — it may have been moved or unpublished.</p>
          <Link href={`/courses/${slug}`} className="btn primary" style={{ display: "inline-block", marginTop: 14 }}>
            Back to the course
          </Link>
        </div>
      </main>
    );
  }

  if (!lesson) {
    return (
      <main className="page" style={{ maxWidth: 860 }}>
        <SkRows n={5} label="Loading the lesson" />
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      {/* No `overflow: hidden` on this wrapper: `overflow` makes the panel itself
          the scroll container the sticky header below resolves against, and the
          panel never scrolls — so the header stayed put and slid away with the
          page. Nothing needs clipping either; every child sits inside `p-4`. */}
      <div className="dark-panel" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
      {/* `--sticky-top` is the site's one "clears the topbar" number; the 74px
          here was a fourth guess at it. */}
      <div className="sticky top-[var(--sticky-top)] z-10 rounded-t-[inherit] border-b border-border bg-[#141310]/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <Link href={`/courses/${slug}`} className="font-medium text-accent">
            ← {lesson.course.title}
          </Link>
        </div>
        <div className="mt-0.5 line-clamp-1 text-sm font-semibold text-text">
          {lesson.sectionTitle ? `${lesson.sectionTitle} — ` : ""}
          {lesson.title}
        </div>
        <div className="mt-0.5 text-[11px] text-dim">
          {formatSec(lesson.durationSec)} · {lesson.isPreview ? "Preview" : "Full lesson"}
        </div>
      </div>

      <div className="flex border-b border-border">
        {(["watch", "notes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-[44px] flex-1 text-sm font-medium ${tab === t ? "border-b-2 border-accent text-text" : "text-dim"}`}
          >
            {t === "watch" ? "Watch" : `Notes (${lesson.notes.length})`}
          </button>
        ))}
      </div>

      {tab === "watch" ? (
        <div className="p-4">
          {videoUrl ? (
            <video controls autoPlay className="w-full rounded-lg bg-black" src={videoUrl} onError={() => setVideoError(true)} />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
              {videoError ? (
                <>
                  <div className="text-2xl">🔒</div>
                  <div className="text-sm font-medium text-text">This lesson is locked</div>
                  <div className="text-xs text-muted">Sign in, or upgrade to Premium, to watch this lesson.</div>
                </>
              ) : (
                <>
                  <div className="text-2xl">▶</div>
                  <div className="text-sm text-muted">Tap play to stream this lesson</div>
                </>
              )}
              {/* Was one button labelled "Go to course" that called `loadVideo`
                  again, with a second "Go to course →" link under it saying the
                  same thing. Locked gets the link; unlocked gets the retry. */}
              {videoError ? (
                <Link
                  href={`/courses/${slug}`}
                  className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-black hover:bg-accent-hover"
                >
                  Go to course
                </Link>
              ) : (
                <button
                  onClick={loadVideo}
                  className="min-h-[40px] rounded-full bg-accent px-5 py-2 text-sm font-bold text-black hover:bg-accent-hover"
                >
                  Play lesson
                </button>
              )}
            </div>
          )}

          {/* lesson attachments — ZIPs, PDFs (the actual downloadable files) */}
          {lesson.attachments.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">Download course files</div>
              <div className="space-y-2">
                {lesson.attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                    <span className="text-lg">📦</span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium text-text">{a.fileName || "Course file"}</div>
                      <div className="text-[11px] text-dim">
                        {a.fileType} · {a.sizeMb > 0 ? `${a.sizeMb.toFixed(1)} MB` : "size unknown"}
                      </div>
                    </div>
                    <button
                      onClick={() => downloadFile(a.id, a.fileName)}
                      className="min-h-[40px] shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black hover:bg-accent-hover"
                    >
                      ⬇ Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* files / download variants */}
          {lesson.files.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">Available downloads</div>
              <div className="space-y-2">
                {lesson.files.map((f) => (
                  <div key={f.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text">{f.label}</span>
                      {f.isBest && <span className="rounded bg-accent px-1 text-[9px] font-bold text-black">BEST</span>}
                      {f.hasSubtitles && <span className="rounded bg-surface-raised px-1 text-[9px] text-muted">SUB</span>}
                      {f.audio && <span className="rounded bg-surface-raised px-1 text-[9px] text-muted">{f.audio}</span>}
                      <span className="ml-auto text-[11px] text-dim">
                        {f.sizeMb.toFixed(1)} MB · {f.codec ?? f.format}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <button
                        onClick={() => sendToTelegram(f.label)}
                        disabled={sending !== null}
                        className="min-h-[36px] rounded-full bg-accent px-3 py-1 font-bold text-black disabled:opacity-60"
                      >
                        {sending === f.label ? "Sending…" : "⚡ Send to Telegram"}
                      </button>
                      <button
                        onClick={copyLink}
                        className="min-h-[36px] rounded-full border border-border px-3 py-1 text-muted hover:text-text"
                      >
                        Copy lesson link
                      </button>
                      {/* Built from the route params rather than `window.location`:
                          this component is prerendered for the static export, and
                          reading `window` during render is a build-time crash
                          waiting for the day the early return above changes. */}
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(
                          `https://syncourse.pages.dev/courses/${slug}/lessons/${lessonId}`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-[36px] items-center rounded-full border border-border px-3 py-1 text-muted hover:text-text"
                      >
                        Share on Telegram
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {lesson.notes.length === 0 && <div className="text-center text-sm text-dim">No notes for this lesson yet.</div>}
          {lesson.notes.map((n) => (
            <div key={n.id} className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="text-sm font-semibold text-text">{n.title}</div>
                {n.isCheatsheet && (
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">CHEAT-SHEET</span>
                )}
              </div>
              <div className="px-4 py-3">
                {/* `prose-sm prose-invert` are typography-plugin classes and this
                    app has no typography plugin, so they were doing nothing — and
                    Tailwind's preflight sets `list-style: none`, which is why the
                    bullets of every note were missing. The arbitrary variants
                    below are the styling; the `ul` rules are the fix. */}
                <div
                  className="max-w-none text-sm leading-relaxed text-muted [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-text [&_li]:my-1 [&_p]:my-2 [&_strong]:text-text [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(n.richText) }}
                />
                {n.imageUrls.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {n.imageUrls.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt={`Note image ${i + 1}`} className="w-full rounded-md" loading="lazy" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast message={toast} />
      </div>
    </main>
  );
}

/** Tiny markdown renderer for the seeded notes (headings, bold, lists). */
function renderMarkdown(md: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = escape(md).split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h3>${line.slice(3)}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const item = line.slice(2);
      const [term, ...rest] = item.split(":");
      const body = rest.join(":");
      out.push(
        `<li><strong>${term.trim()}</strong>${body ? `: ${body.trim()}` : ""}</li>`,
      );
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  return out.join("");
}
