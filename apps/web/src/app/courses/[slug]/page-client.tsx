"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Heart,
  ListPlus,
  MessageCircle,
  Play,
  Share2,
  Star,
  X,
} from "lucide-react";
import { get, post } from "@/lib/api";
import type { CourseDetail, CourseSummary, DiscussionThread, ReviewRow } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { StarPicker } from "@/components/StarRating";
import { formatDuration, formatSec, compact, formatDate } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { hueFromString, CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, token } = useAuth();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [similar, setSimilar] = useState<CourseSummary[]>([]);
  const [error, setError] = useState(false);
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
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [catSlugs, setCatSlugs] = useState<Record<string, string>>({});
  const [downloadOpen, setDownloadOpen] = useState(false);

  useEffect(() => {
    get<{ name: string; slug: string }[]>("/categories")
      .then((cats) => setCatSlugs(Object.fromEntries(cats.map((c) => [c.name, c.slug]))))
      .catch(() => {});
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
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, upvoted: r.upvoted, upvotes: r.upvotes } : t)));
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

  const onCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${slug}`));
      return;
    }
    setCoverBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const up = await post<{ url: string }>("/images/upload", { dataUrl });
      await post(`/admin/courses/${slug}/cover`, { thumbnailUrl: up.url, bannerUrl: up.url });
      setCourse((c) => (c ? { ...c, thumbnailUrl: up.url, bannerUrl: up.url } : c));
      flash("Cover updated ✨");
    } catch (err: any) {
      flash(err?.message || "Upload failed");
    } finally {
      setCoverBusy(false);
    }
  };

  if (error || !course) {
    return (
      <main className="page">
        <MobileHeader title="Course" />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">{error ? "Course not found" : "Loading…"}</p>
        </div>
      </main>
    );
  }

  const hue = hueFromString(course.slug);
  const firstLesson = course.sections[0]?.lessons[0];

  return (
    <main className="page">
      <MobileHeader title="Course detail" />

      {/* hero */}
      <div
        className="detail-hero"
        style={{
          background: `linear-gradient(90deg,rgba(7,6,5,.98) 9%,rgba(7,6,5,.74) 48%,rgba(7,6,5,.06)), linear-gradient(135deg, hsl(${(hue + 40) % 360} 42% 16%), hsl(${hue} 50% 9%) 47%, #201712)`,
        }}
      >
        {course.bannerUrl || course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryUrl(course.bannerUrl || course.thumbnailUrl, { width: 840, height: 472 }) ?? undefined}
            alt={course.title}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }}
          />
        ) : null}
        <div className="hero-content">
          <span className="eyebrow">
            {course.categoryNames.join(" · ") || "Course"} · {course.level}
          </span>
          <h1 className="display" style={{ fontSize: "clamp(30px,4vw,52px)" }}>{course.title}</h1>
          <p>{course.description}</p>
          <div className="detail-meta">
            <span>
              <Star size={14} fill="currentColor" className="rating" /> {course.ratingAvg.toFixed(1)} · {compact(course.ratingCount)} ratings
            </span>
            <span>{formatDuration(course.durationMin)}</span>
            <span>{course.lessonCount} lessons</span>
            <span>{course.language || "English"}</span>
          </div>
          <div className="actions">
            {firstLesson ? (
              <Link href={`/courses/${course.slug}/lessons/${firstLesson.id}`} className="btn primary">
                <Play size={14} fill="currentColor" style={{ display: "inline", verticalAlign: "middle" }} /> Start course
              </Link>
            ) : (
              <button onClick={onEnroll} className="btn primary">
                <Play size={14} fill="currentColor" style={{ display: "inline", verticalAlign: "middle" }} /> {enrolled ? "Enrolled" : "Enroll free"}
              </button>
            )}
            <button onClick={() => setDownloadOpen(true)} className="btn primary">
              <Download size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Download materials
            </button>
            {course.previewVideoUrl ? (
              <a href={course.previewVideoUrl} target="_blank" rel="noreferrer" className="btn">
                <SparklesInline /> Preview
              </a>
            ) : (
              <button onClick={onEnroll} className="btn">
                <SparklesInline /> Trailer
              </button>
            )}
          </div>
          <div className="icon-actions">
            <button className="icon-btn" onClick={onSave}>
              {saved ? <Check size={14} /> : <Bookmark size={14} />} {saved ? "Saved" : "Save"}
            </button>
            <button className="icon-btn" onClick={onEnroll}>
              <Check size={14} /> {enrolled ? "Enrolled" : "Mark complete"}
            </button>
            <button className="icon-btn" onClick={() => flash("Lists coming soon — save it for now")}>
              <ListPlus size={14} /> List
            </button>
            <button className="icon-btn" onClick={onLike}>
              <Heart size={14} /> {liked ? "Liked" : "Like"}
            </button>
            <button className="icon-btn" onClick={onShare}>
              <Share2 size={14} /> Share
            </button>
          </div>
          {user?.isStaff && (
            <div style={{ marginTop: 4 }}>
              <button className="btn ghost" onClick={() => coverInputRef.current?.click()} disabled={coverBusy}>
                {coverBusy ? "Uploading…" : "✎ Edit cover"}
              </button>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverFile} />
            </div>
          )}
        </div>
      </div>

      <div className="detail-columns">
        <div>
          {/* info table */}
          <div className="info-table">
            {course.prerequisites && (
              <>
                <b>PREREQUISITES</b>
                <span>{course.prerequisites}</span>
              </>
            )}
            {course.audience.length > 0 && (
              <>
                <b>TARGET AUDIENCE</b>
                <span>{course.audience.join(", ")}</span>
              </>
            )}
            <b>TAGS</b>
            <span className="pills">
              {course.tags.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="badge">
                  {t}
                </Link>
              ))}
              {course.tags.length === 0 && <span className="muted">—</span>}
            </span>
            <b>LECTURER</b>
            <span>
              {course.lecturer ? (
                <Link href={`/lecturers/${course.lecturer.slug}`}>
                  {course.lecturer.name} <ChevronRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
                </Link>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
            <b>PUBLISHER</b>
            <span>
              {course.organization ? (
                <Link href={`/organizations/${course.organization.slug}`}>
                  {course.organization.name} <ChevronRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
                </Link>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </div>

          {/* curriculum */}
          <section className="rail">
            <div className="section-head">
              <h2>
                Curriculum · {course.sections.length} modules
              </h2>
              <span className="muted mono" style={{ fontSize: 10 }}>
                {formatDuration(course.durationMin)} total
              </span>
            </div>
            <div className="accordion">
              {course.sections.map((s, i) => (
                <div className="accordion-item" key={s.id}>
                  <button className="accordion-trigger" onClick={() => setOpenSection(openSection === s.id ? null : s.id)}>
                    <span>
                      <span className="eyebrow" style={{ marginRight: 10 }}>{String(i + 1).padStart(2, "0")}</span>
                      {s.title} <span className="muted" style={{ fontSize: 11 }}>· {s.lessons.length} lessons</span>
                    </span>
                    {openSection === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {openSection === s.id && (
                    <div className="lesson-list">
                      {s.lessons.map((l) => (
                        <Link key={l.id} href={`/courses/${course.slug}/lessons/${l.id}`} className="lesson">
                          <span>{l.isPreview ? "▶" : String(l.orderIndex + 1).padStart(2, "0")}</span>
                          <span>{l.title}</span>
                          <span className="muted" style={{ marginLeft: "auto" }}>{formatSec(l.durationSec)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* downloads analytics */}
          <section className="rail">
            <div className="section-head">
              <h2>Downloads on Syncourse</h2>
            </div>
            <div className="dark-panel" style={{ padding: 18, display: "flex", gap: 28 }}>
              {[
                ["TOTAL", compact(course.downloads.total)],
                ["LAST 30 DAYS", compact(course.downloads.last30)],
                ["LAST 7 DAYS", compact(course.downloads.last7)],
                ["TODAY", String(course.downloads.today)],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong style={{ fontSize: 20 }}>{value}</strong>
                  <div className="muted mono" style={{ fontSize: 9 }}>{label}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside>
          {/* how it's rated */}
          <div className="dark-panel rating-block">
            <span className="eyebrow">How it&apos;s rated</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
              <strong style={{ fontSize: 36 }}>{course.ratings.avg.toFixed(1)}</strong>
              <span className="muted">/ 5</span>
            </div>
            <div className="rating" style={{ fontSize: 11, marginTop: 2 }}>
              <Star size={13} fill="currentColor" style={{ display: "inline" }} /> Source rating · {compact(course.ratings.count)} votes
            </div>
            <div className="bars">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = course.ratings.distribution[n] ?? 0;
                const max = Math.max(1, ...Object.values(course.ratings.distribution));
                return <i key={n} style={{ height: `${(count / max) * 92}%` }} title={`${n}★`} />;
              })}
            </div>
            <p className="muted mono" style={{ fontSize: 10, margin: "12px 0 0" }}>
              Community mean · {compact(course.ratings.count)} learners
            </p>
            <div style={{ marginTop: 14 }}>
              <StarPicker value={myRating} onChange={onRate} />
            </div>
          </div>

          {/* reviews */}
          <div style={{ marginTop: 25 }}>
            <div className="section-head">
              <h2>Reviews</h2>
              <button className="btn" onClick={() => document.getElementById("review-box")?.scrollIntoView({ behavior: "smooth" })}>
                <MessageCircle size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Write
              </button>
            </div>
            {course.reviews.length === 0 && (
              <div className="dark-panel" style={{ padding: 25, textAlign: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>No reviews yet — start the thread.</p>
              </div>
            )}
            {course.reviews.slice(0, 4).map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>

          {/* review composer */}
          <div id="review-box" className="dark-panel" style={{ padding: 18, marginTop: 22 }}>
            <h3 style={{ fontSize: 15 }}>Share a thought</h3>
            {token ? (
              <>
                <textarea
                  rows={4}
                  className="form-input"
                  placeholder="What did this course change for you?"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
                <label className="badge" style={{ margin: "5px 0 15px" }}>
                  <input type="checkbox" checked={containsSpoilers} onChange={(e) => setContainsSpoilers(e.target.checked)} /> Contains spoilers
                </label>
                <button className="btn primary" onClick={onPostReview} disabled={!reviewText.trim()}>
                  Post review
                </button>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>
                <Link href="/auth" style={{ color: "hsl(var(--primary))", fontWeight: 700 }}>Sign in</Link> to rate and review.
              </p>
            )}
          </div>

          {/* discussion */}
          <div style={{ marginTop: 25 }}>
            <div className="section-head">
              <h2>Discussion · {threads.length}</h2>
            </div>
            <div className="dark-panel" style={{ padding: 16 }}>
              {token ? (
                <textarea
                  rows={2}
                  className="form-input"
                  placeholder="Join the thread — ask a question or share a tip…"
                  value={threadText}
                  onChange={(e) => setThreadText(e.target.value)}
                />
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>
                  <Link href="/auth" style={{ color: "hsl(var(--primary))", fontWeight: 700 }}>Sign in</Link> to join the thread.
                </p>
              )}
              {threads.length === 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>No replies yet — start the thread.</p>
              )}
              {threads.slice(0, 5).map((t) => (
                <DiscussionCard key={t.id} thread={t} onUpvote={onUpvote} />
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* similar */}
      {similar.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>More like this</h2>
            <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row">
            {similar.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      {/* downloads sheet */}
      {downloadOpen && (
        <div className="sheet" onClick={() => setDownloadOpen(false)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>Available downloads</h3>
              <button className="icon-btn" onClick={() => setDownloadOpen(false)}><X size={15} /></button>
            </div>
            <p className="muted">Lesson files are served through short-lived signed links. Premium members get full-speed delivery.</p>
            {course.sections.map((s) =>
              s.lessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/courses/${course.slug}/lessons/${l.id}`}
                  className="dark-panel"
                  style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, marginTop: 9 }}
                >
                  <Download size={15} className="rating" />
                  <span style={{ flex: 1 }}>{l.title}</span>
                  <span className="muted mono" style={{ fontSize: 10 }}>{formatSec(l.durationSec)}</span>
                  <ChevronRight size={14} className="muted" />
                </Link>
              )),
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="sheet" style={{ pointerEvents: "none", background: "transparent", display: "grid", placeItems: "end center", paddingBottom: 40 }}>
          <div className="dark-panel" style={{ padding: "14px 22px", background: "#f6a437", color: "#211308", fontWeight: 800, fontSize: 12 }}>
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

function SparklesInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ display: "inline", verticalAlign: "middle" }}>
      <path d="M12 2l1.9 5.7L19.6 9.6l-5.7 1.9L12 17.2l-1.9-5.7L4.4 9.6l5.7-1.9L12 2z" />
    </svg>
  );
}

function DiscussionCard({ thread, onUpvote }: { thread: DiscussionThread; onUpvote: (id: string) => void }) {
  const [show, setShow] = useState(!thread.containsSpoilers);
  return (
    <div className="review" style={{ borderTop: "1px solid hsl(var(--border))", padding: "14px 0" }}>
      <div className="review-top">
        <span>
          <strong>{thread.userName}</strong> <span className="muted mono">· {formatDate(thread.createdAt)}</span>
          {thread.isStaff && <span className="badge" style={{ marginLeft: 6 }}>Staff</span>}
        </span>
        <button
          onClick={() => onUpvote(thread.id)}
          className="rating"
          style={{ background: "none", border: 0, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
        >
          ▲ {thread.upvotes}
        </button>
      </div>
      {thread.containsSpoilers && !show ? (
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShow(true)}>
          This may contain spoilers — Show
        </button>
      ) : (
        <p style={{ fontSize: 12, color: "#c9c0b5", lineHeight: 1.6 }}>{thread.body}</p>
      )}
      {thread.replies?.map((rep) => (
        <div key={rep.id} style={{ marginLeft: 16, borderLeft: "2px solid hsl(var(--border))", paddingLeft: 12 }}>
          <DiscussionCard thread={rep} onUpvote={onUpvote} />
        </div>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewRow }) {
  const [show, setShow] = useState(!review.containsSpoilers);
  return (
    <div className="review">
      <div className="review-top">
        <span>
          <strong>{review.userName}</strong> <span className="muted mono">· {formatDate(review.createdAt)}</span>
          {review.isStaff && <span className="badge" style={{ marginLeft: 6 }}>Staff</span>}
        </span>
        <span className="rating"><Star size={11} fill="currentColor" /> {review.editedAt ? "edited" : "5"}</span>
      </div>
      {review.containsSpoilers && !show ? (
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShow(true)}>
          This review may contain spoilers — Show review
        </button>
      ) : (
        <p>{review.body}</p>
      )}
      {review.replyCount > 0 && (
        <button className="btn ghost" style={{ padding: 0, fontSize: 10 }}>
          {review.replyCount} replies — Join the thread
        </button>
      )}
      {review.replies?.map((rep) => (
        <div key={rep.id} style={{ marginLeft: 16, borderLeft: "2px solid hsl(var(--border))", paddingLeft: 12 }}>
          <p className="muted" style={{ fontSize: 11 }}>
            <strong>{rep.userName}</strong>: {rep.body}
          </p>
        </div>
      ))}
    </div>
  );
}
