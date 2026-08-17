"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/lib/useToast";
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
import type { CourseDetail, CourseSummary, ReviewRow } from "@/lib/types";
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
  const { toast, setToast } = useToast();
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);

  useEffect(() => {
    get<CourseDetail>(`/courses/${slug}`)
      .then((d) => {
        setCourse(d);
        setOpenSection(d.sections[0]?.id ?? null);
        const cat = d.categoryNames[0];
        if (cat) {
          // resolve category name -> slug (the list API filters by slug)
          get<{ name: string; slug: string }[]>("/categories")
            .then((cats) => {
              const catSlug = cats.find((c) => c.name === cat)?.slug ?? cat;
              return get<{ results: CourseSummary[] }>(`/courses?category=${encodeURIComponent(catSlug)}&limit=8`);
            })
            .then((r) => {
              const filtered = r.results.filter((c) => c.id !== d.id);
              if (filtered.length >= 4) {
                setSimilar(filtered);
              } else if (d.lecturer) {
                // fallback: same instructor
                return get<{ results: CourseSummary[] }>(`/courses?lecturer=${encodeURIComponent(d.lecturer.slug)}&limit=8`)
                  .then((r2) => setSimilar(r2.results.filter((c) => c.id !== d.id)))
                  .catch(() => setSimilar(filtered));
              }
              setSimilar(filtered);
            })
            .catch(() => {});
        }
      })
      .catch(() => setError(true));
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

  const onUpvote = async (id: string) => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ upvoted: boolean; upvotes: number }>(`/discussion/${id}/upvote`);
      setCourse((c) =>
        c
          ? {
              ...c,
              reviews: c.reviews.map((rv) => (rv.id === id ? { ...rv, upvoted: r.upvoted, upvotes: r.upvotes } : rv)),
            }
          : c,
      );
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onReplyToReview = async (parentId: string, body: string) => {
    if (!requireAuth() || !body.trim()) return;
    try {
      await post(`/courses/${slug}/reviews`, { body, parentId });
      setCourse((c) =>
        c
          ? { ...c, reviews: c.reviews.map((rv) => (rv.id === parentId ? { ...rv, replyCount: rv.replyCount + 1 } : rv)) }
          : c,
      );
      flash("Reply posted");
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
        </div>
      </div>

      {/* action row — sits on the plain page background, off the hero image (phonofilm) */}
      <div className="detail-actions">
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
          </div>

          {/* instructors — avatar grid, every name clickable (phonofilm Actors) */}
          {course.lecturer && (
            <section className="rail">
              <div className="section-head"><h2>Instructors</h2></div>
              <div className="instructor-grid">
                <Link href={`/lecturers/${course.lecturer.slug}`} className="instructor-card">
                  <div className="instructor-card__avatar">
                    {course.lecturer.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cloudinaryUrl(course.lecturer.photoUrl, { width: 120, height: 120 }) ?? undefined} alt={course.lecturer.name} />
                    ) : (
                      course.lecturer.name.charAt(0)
                    )}
                  </div>
                  <span className="instructor-card__name">{course.lecturer.name}</span>
                  <span className="instructor-card__role">Instructor</span>
                </Link>
              </div>
            </section>
          )}

          {/* published by — logo grid (phonofilm Studios) */}
          {course.organization && (
            <section className="rail">
              <div className="section-head"><h2>Published by</h2></div>
              <div className="publisher-grid">
                <Link href={`/publishers/${course.organization.slug}`} className="publisher-row">
                  <span className="publisher-row__logo">
                    {course.organization.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cloudinaryUrl(course.organization.logoUrl, { width: 64, height: 64 }) ?? undefined} alt={course.organization.name} />
                    ) : (
                      course.organization.name.charAt(0)
                    )}
                  </span>
                  <span>
                    <strong>{course.organization.name}</strong>
                    <small className="muted">Publisher · {compact(course.organization.subscribers)} learners</small>
                  </span>
                </Link>
              </div>
            </section>
          )}

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
            <div className="dark-panel" style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 28 }}>
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
              {/* 14-day trend sparkline (phonofilm: chart under the stat numbers) */}
              <div style={{ marginTop: 14 }}>
                <Sparkline data={course.downloads.sparkline ?? []} />
                <div className="muted mono" style={{ fontSize: 9, marginTop: 6 }}>Last 14 days</div>
              </div>
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
            {course.ratings.count > 0 ? (
              <div className="bars">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = course.ratings.distribution[n] ?? 0;
                  const max = Math.max(1, ...Object.values(course.ratings.distribution));
                  const pct = (count / max) * 92;
                  return (
                    <i
                      key={n}
                      style={{ height: `${Math.max(pct, count > 0 ? 8 : 4)}%`, opacity: count > 0 ? 0.8 : 0.18 }}
                      title={`${n}★ · ${count}`}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 11, margin: "16px 0 0" }}>No ratings yet — be the first to rate this course.</p>
            )}
            <p className="muted mono" style={{ fontSize: 10, margin: "12px 0 0" }}>
              Community mean · {compact(course.ratings.count)} learners
            </p>
            <div style={{ marginTop: 14 }}>
              <StarPicker value={myRating} onChange={onRate} />
            </div>
          </div>

          {/* reviews — unified: stars + upvote + reply on the same card (phonofilm) */}
          <div style={{ marginTop: 25 }}>
            <div className="section-head">
              <h2>Reviews · {course.reviews.length}</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                <span className="rating"><Star size={12} fill="currentColor" style={{ display: "inline" }} /> {course.ratings.avg.toFixed(1)}</span>
                <span style={{ marginLeft: 6 }}>{compact(course.ratings.count)} ratings</span>
              </span>
              <button className="btn" onClick={() => document.getElementById("review-box")?.scrollIntoView({ behavior: "smooth" })}>
                <MessageCircle size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Write
              </button>
            </div>
            {course.reviews.length === 0 && (
              <div className="dark-panel" style={{ padding: 25, textAlign: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>No reviews yet — start the thread.</p>
              </div>
            )}
            {course.reviews.slice(0, 8).map((r) => (
              <ReviewCard key={r.id} review={r} onUpvote={onUpvote} onReply={onReplyToReview} />
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
            <p className="muted">Lesson files are served through short-lived signed links. <span className="rating">Premium members get full-speed delivery.</span></p>
            {course.sections.map((s, si) => (
              <div key={s.id} style={{ marginTop: 12 }}>
                {/* bulk download — whole module in one click (phonofilm "Season [Download]") */}
                <div
                  className="dark-panel"
                  style={{
                    padding: "13px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "1px dashed hsl(var(--primary) / .4)",
                    background: "hsl(var(--primary) / .06)",
                  }}
                >
                  <Download size={15} className="rating" />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                    Module {si + 1} — {s.title}
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                      {s.lessons.length} lessons
                    </span>
                  </span>
                  <Link href={`/courses/${course.slug}/lessons/${s.lessons[0]?.id ?? ""}?bulk=1`} className="btn primary" style={{ padding: "7px 13px", fontSize: 11 }}>
                    Download module
                  </Link>
                  <span className="badge" title="Fast, full-speed delivery requires Premium">
                    <ZapInline /> Fast
                  </span>
                </div>
                {/* individual lessons */}
                {s.lessons.map((l) => (
                  <Link
                    key={l.id}
                    href={`/courses/${course.slug}/lessons/${l.id}`}
                    className="dark-panel"
                    style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}
                  >
                    <Download size={15} className="rating" />
                    <span style={{ flex: 1 }}>{l.title}</span>
                    <span className="muted mono" style={{ fontSize: 10 }}>{formatSec(l.durationSec)}</span>
                    {/* speed-tier hint surfaced at course level (phonofilm: Premium fork visible here) */}
                    {course.isPremium && <span className="badge" style={{ fontSize: 9 }}><ZapInline /> Fast</span>}
                    <ChevronRight size={14} className="muted" />
                  </Link>
                ))}
              </div>
            ))}
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

function ZapInline() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

/** lightweight 14-day trend line — phonofilm sparkline under download stats */
function Sparkline({ data }: { data: number[] }) {
  const w = 220;
  const h = 34;
  if (!data || data.length < 2) {
    return <div className="muted mono" style={{ fontSize: 9, height: h }}>No recent download activity.</div>;
  }
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="hsl(var(--primary) / .12)" />
    </svg>
  );
}

function ReviewCard({
  review,
  onUpvote,
  onReply,
}: {
  review: ReviewRow;
  onUpvote: (id: string) => void;
  onReply: (parentId: string, body: string) => void;
}) {
  const [show, setShow] = useState(!review.containsSpoilers);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");

  return (
    <div className="review">
      <div className="review-top">
        <span>
          <strong>{review.userName}</strong> <span className="muted mono">· {formatDate(review.createdAt)}</span>
          {review.isStaff && <span className="badge" style={{ marginLeft: 6 }}>Staff</span>}
        </span>
        <span className="rating">
          {review.rating > 0 ? (
            <>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={11}
                  fill={n <= review.rating ? "currentColor" : "none"}
                  style={{ display: "inline", opacity: n <= review.rating ? 1 : 0.35 }}
                />
              ))}
              <span style={{ marginLeft: 3 }}>{review.rating}.0</span>
            </>
          ) : (
            <span className="muted mono" style={{ fontSize: 10 }}>thread</span>
          )}
        </span>
      </div>
      {review.containsSpoilers && !show ? (
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShow(true)}>
          This review may contain spoilers — Show review
        </button>
      ) : (
        <p>{review.body}</p>
      )}

      {/* phonofilm review actions: upvote/downvote counter + Reply */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        <button
          onClick={() => onUpvote(review.id)}
          className="rating"
          style={{ background: "none", border: 0, fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
          title="Helpful"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 10H4l8-10z" /></svg>
          {review.upvotes ?? 0}
          {review.upvoted ? " · upvoted" : ""}
        </button>
        <button className="link-btn" style={{ fontSize: 11 }} onClick={() => setReplying((r) => !r)}>
          Reply
        </button>
        {review.replyCount > 0 && (
          <span className="muted mono" style={{ fontSize: 10 }}>{review.replyCount} repl{review.replyCount === 1 ? "y" : "ies"}</span>
        )}
      </div>

      {replying && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <input
            className="form-input"
            style={{ margin: 0, flex: 1, padding: "9px 12px" }}
            placeholder="Write a reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <button
            className="btn primary"
            style={{ padding: "9px 14px" }}
            disabled={!replyText.trim()}
            onClick={() => {
              onReply(review.id, replyText);
              setReplyText("");
              setReplying(false);
            }}
          >
            Post
          </button>
        </div>
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
