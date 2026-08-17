"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import type { CourseDetail, CourseSummary, DiscussionThread, ReviewRow } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Stars, StarPicker } from "@/components/StarRating";
import { formatDuration, formatSec, compact, ratingColor, formatDate } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";

// Static export: every real slug is served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course" }];
}

export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, token } = useAuth();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [similar, setSimilar] = useState<CourseSummary[]>([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [threadText, setThreadText] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    get<CourseDetail>(`/courses/${slug}`)
      .then((d) => {
        setCourse(d);
        setOpenSection(d.sections[0]?.id ?? null);
        const cat = d.categoryNames[0];
        if (cat) {
          get<{ results: CourseSummary[] }>(`/courses?category=${encodeURIComponent(cat)}&limit=8`)
            .then((r) => setSimilar(r.results.filter((c) => c.id !== d.id)))
            .catch(() => {});
        }
      })
      .catch(() => setError(true));
    get<{ threads: DiscussionThread[] }>(`/courses/${slug}/discussion`)
      .then((d) => setThreads(d.threads))
      .catch(() => {});
  }, [slug]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const requireAuth = () => {
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${slug}`));
      return false;
    }
    return true;
  };

  const onEnroll = async () => {
    if (!requireAuth()) return;
    try {
      await post(`/courses/${slug}/enroll`);
      setEnrolled(true);
      flash("Enrolled — happy learning! 🎓");
    } catch (e: any) {
      flash(e.message || "Failed to enroll");
    }
  };

  const onSave = async () => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ saved: boolean }>(`/courses/${slug}/save`);
      setSaved(r.saved);
      flash(r.saved ? "Saved to watchlist" : "Removed from watchlist");
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onLike = async () => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ liked: boolean }>(`/courses/${slug}/like`);
      setLiked(r.liked);
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onRate = async (stars: number) => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ ratingAvg: number }>(`/courses/${slug}/rate`, { stars });
      setMyRating(stars);
      setCourse((c) => (c ? { ...c, ratingAvg: r.ratingAvg } : c));
      flash("Thanks for rating!");
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onPostReview = async () => {
    if (!requireAuth() || !reviewText.trim()) return;
    try {
      const review = await post<ReviewRow>(`/courses/${slug}/reviews`, {
        body: reviewText,
        containsSpoilers,
      });
      setCourse((c) => (c ? { ...c, reviews: [review, ...c.reviews] } : c));
      setReviewText("");
      setContainsSpoilers(false);
      flash("Review posted");
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onPostThread = async () => {
    if (!requireAuth() || !threadText.trim()) return;
    try {
      const t = await post<DiscussionThread>(`/courses/${slug}/discussion`, { body: threadText });
      setThreads((prev) => [t, ...prev]);
      setThreadText("");
      flash("Posted to the thread");
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onUpvote = async (id: string) => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ upvoted: boolean; upvotes: number }>(`/discussion/${id}/upvote`);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, upvoted: r.upvoted, upvotes: r.upvotes } : t
        )
      );
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onShare = () => {
    if (navigator.share) {
      void navigator.share({ title: course?.title, url: window.location.href });
    } else {
      void navigator.clipboard?.writeText(window.location.href);
      flash("Link copied");
    }
  };

  if (error || !course) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        {error ? "Course not found" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* banner */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
        {course.bannerUrl || course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(course.bannerUrl || course.thumbnailUrl, { width: 840, height: 472 }) ?? undefined} alt={course.title} className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">{course.categoryNames.join(" · ")}</div>
          <h1 className="mt-0.5 text-xl font-bold leading-tight text-text">{course.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={ratingColor(course.ratingAvg)}>★ {course.ratingAvg.toFixed(1)}</span>
            <span className="text-dim">· {compact(course.ratingCount)} ratings</span>
            <span className="text-dim">· {course.level}</span>
            <span className="text-dim">· {formatDuration(course.durationMin)}</span>
            <span className="text-dim">· {course.lessonCount} lessons</span>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          onClick={onEnroll}
          className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-hover"
        >
          {enrolled ? "Continue learning" : "Enroll free"}
        </button>
        <button
          onClick={onSave}
          className={`rounded-full border px-3 py-2 text-sm ${saved ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}
          title="Watchlist"
        >
          {saved ? "✓ Saved" : "＋ Watchlist"}
        </button>
        <button
          onClick={onLike}
          className={`rounded-full border px-3 py-2 text-sm ${liked ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}
          title="Like"
        >
          {liked ? "♥" : "♡"}
        </button>
        <button onClick={onShare} className="rounded-full border border-border px-3 py-2 text-sm text-muted hover:text-text">
          ↗
        </button>
      </div>

      {course.originalPrice ? (
        <div className="px-4 pt-2 text-xs text-muted">
          Original price <span className="line-through">${course.originalPrice}</span>{" "}
          <span className="font-semibold text-success">free here</span>
          {course.isPremium && <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-black">Premium</span>}
        </div>
      ) : null}

      {/* description */}
      <div className="px-4 pt-3">
        <p className={`text-sm leading-relaxed text-muted ${expanded ? "" : "clamp-3"}`}>{course.description}</p>
        {course.description.length > 160 && (
          <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs font-medium text-accent">
            {expanded ? "Show less" : "Read More"}
          </button>
        )}
      </div>

      {/* downloads analytics — the web-only widget */}
      <div className="mx-4 mt-4 rounded-lg border border-border bg-surface p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">Downloads on Syncourse</div>
        <div className="mt-1.5 flex items-end gap-3">
          <div>
            <div className="text-xl font-bold text-text">{compact(course.downloads.total)}</div>
            <div className="text-[10px] text-dim">TOTAL</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-muted">{compact(course.downloads.last30)}</div>
            <div className="text-[10px] text-dim">LAST 30 DAYS</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-muted">{compact(course.downloads.last7)}</div>
            <div className="text-[10px] text-dim">LAST 7 DAYS</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-muted">{course.downloads.today}</div>
            <div className="text-[10px] text-dim">TODAY</div>
          </div>
        </div>
      </div>

      {/* curriculum */}
      <div className="mt-5 px-4">
        <h2 className="mb-2 text-base font-semibold text-text">Curriculum · {course.sections.length} sections</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {course.sections.map((s) => (
            <div key={s.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
                className="flex w-full items-center justify-between bg-surface px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-text">{s.title}</span>
                <span className="text-xs text-dim">{openSection === s.id ? "−" : "+"}</span>
              </button>
              {openSection === s.id && (
                <div className="bg-bg">
                  {s.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/courses/${course.slug}/lessons/${l.id}`}
                      className="flex items-center gap-3 border-t border-border/60 px-4 py-2.5 hover:bg-surface-hover"
                    >
                      <span className="text-[11px] text-dim">{l.orderIndex + 1}</span>
                      <span className={`flex-1 text-sm ${l.isPreview ? "text-accent" : "text-text"}`}>
                        {l.title} {l.isPreview ? "(preview)" : ""}
                      </span>
                      <span className="text-[11px] text-dim">{formatSec(l.durationSec)}</span>
                      <span className="text-[11px] text-dim">▶</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* lecturer + organization */}
      {course.lecturer && (
        <div className="mx-4 mt-5 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-lg font-bold text-accent">
              {course.lecturer.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-dim">Taught By</div>
              <div className="text-sm font-semibold text-text">{course.lecturer.name}</div>
              {course.lecturer.credentials && <div className="text-xs text-muted">{course.lecturer.credentials}</div>}
            </div>
            <Link href={`/browse?lecturer=${course.lecturer.slug}`} className="ml-auto text-xs font-medium text-accent">
              View courses
            </Link>
          </div>
        </div>
      )}
      {course.organization && (
        <div className="mx-4 mt-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-sm font-bold text-accent">
              {course.organization.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-dim">Channel</div>
              <div className="text-sm font-semibold text-text">{course.organization.name}</div>
              <div className="text-xs text-muted">{compact(course.organization.subscribers)} subscribers</div>
            </div>
            <Link href={`/browse?organization=${course.organization.slug}`} className="ml-auto text-xs font-medium text-accent">
              See all
            </Link>
          </div>
        </div>
      )}

      {/* how it's rated + reviews */}
      <div className="mx-4 mt-5">
        <h2 className="mb-2 text-base font-semibold text-text">How it&apos;s rated</h2>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-text">{course.ratings.avg.toFixed(1)}</div>
              <Stars value={course.ratings.avg} />
              <div className="mt-1 text-[10px] text-dim">{course.ratings.count} community ratings</div>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = course.ratings.distribution[n] ?? 0;
                const max = Math.max(1, ...Object.values(course.ratings.distribution));
                return (
                  <div key={n} className="flex items-center gap-2 text-[10px] text-dim">
                    <span className="w-3">{n}★</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <div className="text-xs text-muted">Rate this course</div>
            <StarPicker value={myRating} onChange={onRate} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-text">Reviews · {course.reviews.length}</div>
          {token ? (
            <div className="mt-3">
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share a thought…"
                className="w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
                rows={3}
              />
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={containsSpoilers}
                    onChange={(e) => setContainsSpoilers(e.target.checked)}
                    className="accent-accent"
                  />
                  Contains spoilers
                </label>
                <button
                  onClick={onPostReview}
                  disabled={!reviewText.trim()}
                  className="ml-auto rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black disabled:opacity-40"
                >
                  Post review
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              <Link href="/auth" className="font-medium text-accent">Sign in</Link> to rate and review. Reading is open
              right away.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {course.reviews.length === 0 && <div className="py-4 text-center text-xs text-dim">No reviews yet — start the thread.</div>}
            {course.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </div>
      </div>

      {/* discussion thread */}
      <div className="mx-4 mt-5">
        <h2 className="mb-2 text-base font-semibold text-text">Discussion · {threads.length}</h2>
        <div className="rounded-lg border border-border bg-surface p-4">
          {token ? (
            <div className="flex gap-2">
              <textarea
                value={threadText}
                onChange={(e) => setThreadText(e.target.value)}
                placeholder="Join the thread — ask a question or share a tip…"
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-bg p-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
                rows={2}
              />
              <button
                onClick={onPostThread}
                disabled={!threadText.trim()}
                className="h-fit self-end rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black disabled:opacity-40"
              >
                Post
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">
              <Link href="/auth" className="font-medium text-accent">Sign in</Link> to join the thread.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {threads.length === 0 && (
              <div className="py-4 text-center text-xs text-dim">No replies yet — start the thread.</div>
            )}
            {threads.map((t) => (
              <DiscussionCard key={t.id} thread={t} onUpvote={onUpvote} />
            ))}
          </div>
        </div>
      </div>

      {/* similar */}
      {similar.length > 0 && (
        <div className="mt-5 px-4">
          <h2 className="mb-2 text-base font-semibold text-text">More like this</h2>
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
            {similar.map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className="w-[130px] shrink-0">
                <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cloudinaryUrl(c.thumbnailUrl, { width: 260, height: 390 }) ?? undefined} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-text">{c.title}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function DiscussionCard({ thread, onUpvote }: { thread: DiscussionThread; onUpvote: (id: string) => void }) {
  const [show, setShow] = useState(!thread.containsSpoilers);
  return (
    <div className={`rounded-lg bg-bg p-3 ${thread.depth > 0 ? "ml-4" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-accent">
          {thread.userName.charAt(0).toUpperCase()}
        </span>
        <span className="text-xs font-medium text-text">{thread.userName}</span>
        {thread.isStaff && <span className="rounded bg-accent-soft px-1 text-[9px] font-bold text-accent">STAFF</span>}
        <span className="ml-auto text-[10px] text-dim">{formatDate(thread.createdAt)}</span>
      </div>
      {thread.containsSpoilers && !show ? (
        <button onClick={() => setShow(true)} className="mt-2 w-full rounded border border-border px-3 py-2 text-xs text-muted hover:text-text">
          This may contain spoilers — Show
        </button>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{thread.body}</p>
      )}
      <button
        onClick={() => onUpvote(thread.id)}
        className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${thread.upvoted ? "text-accent" : "text-dim hover:text-text"}`}
      >
        <span>▲</span>
        <span>{thread.upvotes}</span>
      </button>
      {thread.replies?.map((rep) => (
        <DiscussionCard key={rep.id} thread={rep} onUpvote={onUpvote} />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewRow }) {
  const [show, setShow] = useState(!review.containsSpoilers);
  return (
    <div className="rounded-lg bg-bg p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-accent">
          {review.userName.charAt(0).toUpperCase()}
        </span>
        <span className="text-xs font-medium text-text">{review.userName}</span>
        {review.isStaff && (
          <span className="rounded bg-accent-soft px-1 text-[9px] font-bold text-accent">STAFF</span>
        )}
        <span className="ml-auto text-[10px] text-dim">{formatDate(review.createdAt)}</span>
      </div>
      {review.containsSpoilers && !show ? (
        <button onClick={() => setShow(true)} className="mt-2 w-full rounded border border-border px-3 py-2 text-xs text-muted hover:text-text">
          This review may contain spoilers — Show review
        </button>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{review.body}</p>
      )}
      {review.replyCount > 0 && (
        <div className="mt-1.5 text-[11px] text-dim">{review.replyCount} replies — Join the thread</div>
      )}
      {review.replies?.map((rep) => (
        <div key={rep.id} className="mt-2 ml-3 rounded bg-surface p-2 text-xs text-muted">
          <span className="font-medium text-text">{rep.userName}</span>: {rep.body}
        </div>
      ))}
    </div>
  );
}
