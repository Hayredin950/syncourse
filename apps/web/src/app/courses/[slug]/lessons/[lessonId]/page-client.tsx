"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import type { LessonDetail } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatSec } from "@/lib/format";

// Static export: real lesson URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course", lessonId: "lesson" }];
}

export default function LessonPage() {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const router = useRouter();
  const { token } = useAuth();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"watch" | "notes">("watch");
  const [watched, setWatched] = useState(false);
  const { toast, setToast } = useToast();
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    get<LessonDetail>(`/lessons/${lessonId}`)
      .then((d) => {
        setLesson(d);
        setWatched(d.watched);
      })
      .catch(() => setToast("Lesson not found"));
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
      setToast(e.message || "Enroll to watch this lesson");
    }
  };

  const markComplete = async () => {
    if (!token) return;
    try {
      const r = await post<{ progressPct: number }>(`/lessons/${lessonId}/progress`, { completed: !watched });
      setWatched(!watched);
      setLesson((l) => (l ? { ...l, courseProgress: r.progressPct } : l));
      setToast(!watched ? `Lesson completed — course ${r.progressPct}%` : "Marked incomplete");
    } catch (e: any) {
      setToast(e.message);
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
      setToast(e.message || "Download failed — enroll in the course first");
    }
  };

  const copyLink = async (label: string) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setToast(`Link copied (${label}) — paste in IDM / 1DM`);
    }
  };

  if (!lesson) {
    return (
      <main className="page">
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">Loading lesson…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <div className="dark-panel" style={{ overflow: "hidden", borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
      <div className="sticky top-[74px] z-10 border-b border-border bg-[#141310]/95 px-4 py-2 backdrop-blur">
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
          {formatSec(lesson.durationSec)} · {lesson.isPreview ? "Preview" : "Full lesson"} · course {lesson.courseProgress}%
        </div>
      </div>

      <div className="flex border-b border-border">
        {(["watch", "notes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-accent text-text" : "text-dim"}`}
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
                  <div className="text-xs text-muted">Enroll in the course or upgrade to Premium to watch.</div>
                </>
              ) : (
                <>
                  <div className="text-2xl">▶</div>
                  <div className="text-sm text-muted">Tap play to stream this lesson</div>
                </>
              )}
              <button
                onClick={loadVideo}
                className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-black hover:bg-accent-hover"
              >
                {videoError ? "Go to course" : "Play lesson"}
              </button>
              {videoError && (
                <Link href={`/courses/${slug}`} className="text-xs font-medium text-accent">
                  Go to course →
                </Link>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={markComplete}
              className={`flex-1 rounded-full border py-2 text-sm font-medium ${
                watched ? "border-success text-success" : "border-border text-muted hover:text-text"
              }`}
            >
              {watched ? "✓ Completed" : "Mark as watched"}
            </button>
          </div>

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
                      className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black hover:bg-accent-hover"
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
                    <div className="mt-2 flex gap-2 text-[11px]">
                      <button
                        onClick={() => recordDownload(f.label)}
                        className="rounded-full bg-accent px-3 py-1 font-bold text-black"
                      >
                        ⚡ Fast download
                      </button>
                      <button onClick={() => copyLink(f.label)} className="rounded-full border border-border px-3 py-1 text-muted hover:text-text">
                        Copy link · IDM / 1DM
                      </button>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-border px-3 py-1 text-muted hover:text-text"
                      >
                        Free on Telegram
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
                <div
                  className="prose-sm prose-invert max-w-none text-sm leading-relaxed text-muted [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-text [&_li]:my-1 [&_strong]:text-text"
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

      {toast && (
        <div className="sheet" style={{ pointerEvents: "none", background: "transparent", display: "grid", placeItems: "end center", paddingBottom: 40 }}>
          <div className="dark-panel" style={{ padding: "14px 22px", background: "#f6a437", color: "#211308", fontWeight: 800, fontSize: 12 }}>
            {toast}
          </div>
        </div>
      )}
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
