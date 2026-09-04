"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
  Download,
  Heart,
  ListPlus,
  MessageCircle,
  Pencil,
  Play,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { del, get, patch, post } from "@/lib/api";
import type { CourseDetail, CourseSummary, ReviewRow, TelegramFile } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { StarPicker } from "@/components/StarRating";
import { formatDuration, formatSec, compact, formatDate, plural, isOpaqueFileName, mediaTitle } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { hueFromString, CourseCard } from "@/components/CourseCard";
import Modal from "@/components/Modal";
import { AddToListSheet } from "@/components/AddToListSheet";
import { MobileHeader } from "@/components/Nav";
import { SkHero } from "@/components/Skeleton";
import { Toast } from "@/components/Toast";

const BOT_USERNAME = "syncourse_bot";

/**
 * Bot deep links.
 *
 * `dl_<slug>` opens the bot's own picker for the whole course — the long-standing
 * behaviour, kept for "Download all". `dlf_<linkId>` sends exactly one
 * attachment and `dlmod_<linkId>` sends the module that attachment belongs to;
 * both address a `TelegramCourseLink` by id because a `/start` payload is capped
 * at 64 characters and positional addressing breaks on re-import.
 */
const botLink = (payload: string) => `https://t.me/${BOT_USERNAME}?start=${payload}`;

/** Regroup the flat attachment list into the modules the bot delivers. */
function groupTelegramFiles(files: TelegramFile[]) {
  const groups: { key: string; title: string | null; files: TelegramFile[]; sizeMb: number }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  const sorted = [...files].sort(
    (a, b) => (a.moduleOrder ?? 0) - (b.moduleOrder ?? 0) || a.partIndex - b.partIndex,
  );
  for (const f of sorted) {
    const key = f.moduleTitle ?? "__ungrouped__";
    let g = byKey.get(key);
    if (!g) {
      g = { key, title: f.moduleTitle, files: [], sizeMb: 0 };
      byKey.set(key, g);
      groups.push(g);
    }
    g.files.push(f);
    g.sizeMb += f.fileSizeMb ?? 0;
  }
  return groups;
}

export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  return <CourseDetailView slug={slug ?? ""} />;
}

/**
 * Full course detail, driven by a slug prop so it can be rendered both by the
 * static route (via useParams) AND by the smart 404 fallback for courses that
 * were created after the last build (no redeploy needed).
 */
export function CourseDetailView({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, token } = useAuth();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [similar, setSimilar] = useState<CourseSummary[]>([]);
  const [error, setError] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const { toast, setToast } = useToast();
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // Must be declared above every early return: a hook that only runs once the
  // course has loaded changes the hook count between renders.
  const fileModules = useMemo(() => groupTelegramFiles(course?.telegramFiles ?? []), [course]);
  // A Telegram import creates one lesson-less Section per detected module purely
  // so the course has *some* structure. Those rows said "0 lessons / — total"
  // and repeated the file list underneath, so only sections that really contain
  // lessons count as a curriculum.
  const curriculum = useMemo(
    () => (course?.sections ?? []).filter((s) => s.lessons.length > 0),
    [course],
  );

  useEffect(() => {
    get<CourseDetail>(`/courses/${slug}`)
      .then((d) => {
        setCourse(d);
        setOpenSection(d.sections[0]?.id ?? null);
        // Hydrate the action row from the server. Without this the buttons always
        // opened as "Save"/"Like" — you could like a course, reload, and be
        // offered the same button again as if nothing had happened.
        setSaved(d.saved);
        setLiked(d.liked);
        setLikeCount(d.likeCount);
        setMyRating(d.myRating);
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
              // `lecturers` is the full credit list; `lecturer` is the older
              // single field, still sent while the column exists.
              const firstTeacher = d.lecturers?.[0] ?? d.lecturer;
              if (filtered.length >= 4) {
                setSimilar(filtered);
              } else if (firstTeacher) {
                // fallback: same instructor
                return get<{ results: CourseSummary[] }>(`/courses?lecturer=${encodeURIComponent(firstTeacher.slug)}&limit=8`)
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

  const onSave = async () => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ saved: boolean }>(`/courses/${slug}/save`);
      setSaved(r.saved);
      flash(r.saved ? "Saved for later" : "Removed from your library");
    } catch (e: any) {
      flash(e.message);
    }
  };

  const onLike = async () => {
    if (!requireAuth()) return;
    try {
      const r = await post<{ liked: boolean; likeCount: number }>(`/courses/${slug}/like`);
      setLiked(r.liked);
      setLikeCount(r.likeCount);
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
      const reply = await post<ReviewRow>(`/courses/${slug}/reviews`, { body, parentId });
      setCourse((c) =>
        c
          ? {
              ...c,
              reviews: c.reviews.map((rv) =>
                rv.id === parentId
                  ? { ...rv, replyCount: rv.replyCount + 1, replies: [...(rv.replies ?? []), reply] }
                  : rv,
              ),
            }
          : c,
      );
      flash("Reply posted");
    } catch (e: any) {
      flash(e.message);
    }
  };

  /**
   * Edit one's own review or reply. Patches the row in place rather than
   * refetching the course: the reader is looking at the card they just changed,
   * and a full reload would jump them back to the top of the page.
   */
  const onEditReview = async (id: string, body: string) => {
    try {
      const r = await patch<{ body: string; editedAt: string | null }>(`/reviews/${id}`, { body });
      setCourse((c) =>
        c
          ? {
              ...c,
              reviews: c.reviews.map((rv) =>
                rv.id === id
                  ? { ...rv, body: r.body, editedAt: r.editedAt }
                  : { ...rv, replies: rv.replies?.map((rep) => (rep.id === id ? { ...rep, body: r.body, editedAt: r.editedAt } : rep)) },
              ),
            }
          : c,
      );
      flash("Review updated");
    } catch (e: any) {
      flash(e.message);
    }
  };

  /**
   * Delete one's own review or reply. Deleting a top-level review cascades to its
   * replies on the API side, so the whole card goes; deleting a reply only drops
   * that row and decrements the counter its parent prints.
   */
  const onDeleteReview = async (id: string) => {
    try {
      await del(`/reviews/${id}`);
      setCourse((c) => {
        if (!c) return c;
        const wasTopLevel = c.reviews.some((rv) => rv.id === id);
        if (wasTopLevel) return { ...c, reviews: c.reviews.filter((rv) => rv.id !== id) };
        return {
          ...c,
          reviews: c.reviews.map((rv) => {
            if (!rv.replies?.some((rep) => rep.id === id)) return rv;
            return {
              ...rv,
              replies: rv.replies.filter((rep) => rep.id !== id),
              replyCount: Math.max(0, rv.replyCount - 1),
            };
          }),
        };
      });
      flash("Deleted");
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

  if (error) {
    return (
      <main className="page">
        <MobileHeader title="Course" />
        <div className="empty-state" style={{ padding: "48px 24px" }}>
          <div className="empty-icon">🔎</div>
          <h3 style={{ margin: "0 0 6px" }}>We can&apos;t find that course</h3>
          <p>It may have been unpublished, or the link may be out of date.</p>
          <Link href="/browse" className="btn" style={{ marginTop: 18 }}>Browse the catalogue</Link>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="page">
        <MobileHeader title="Course" />
        <SkHero label="Loading the course" />
      </main>
    );
  }

  const hue = hueFromString(course.slug);
  const firstLesson = course.sections[0]?.lessons[0];
  // Every teacher credited, falling back to the single-lecturer field so the page
  // still names someone if it is talking to an API that predates co-teaching.
  const teachers = course.lecturers?.length ? course.lecturers : course.lecturer ? [course.lecturer] : [];

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
              <Star size={14} fill="currentColor" className="rating" />{" "}
              {course.ratingCount > 0
                ? `${course.ratingAvg.toFixed(1)} · ${compact(course.ratingCount)} ratings`
                : "Not yet rated"}
            </span>
            {course.durationMin > 0 && <span>{formatDuration(course.durationMin)}</span>}
            {course.lessonCount > 0 && <span>{course.lessonCount} lessons</span>}
            <span>{course.language || "English"}</span>
          </div>
        </div>
      </div>

      {/* action row — sits on the plain page background, off the hero image (phonofilm) */}
      <div className="detail-actions">
        <div className="actions">
          {firstLesson && (
            <Link href={`/courses/${course.slug}/lessons/${firstLesson.id}`} className="btn primary">
              <Play size={14} fill="currentColor" /> Start course
            </Link>
          )}
          {/* The archive *is* the course, so downloading is the primary action
              whenever there are no lessons to open on the site. */}
          <button onClick={() => setDownloadOpen(true)} className={firstLesson ? "btn" : "btn primary"}>
            <Download size={14} /> Download materials
          </button>
          {course.previewVideoUrl && (
            <a href={course.previewVideoUrl} target="_blank" rel="noreferrer" className="btn">
              <SparklesInline /> Preview
            </a>
          )}
        </div>
        {/* The icon carries the state, not the label. A button that swaps "Like"
            for "Liked" makes you read a word to find out what you did; a filled
            heart and a count you can watch tick up says it at a glance, and the
            label stays put so the row doesn't reflow under your thumb. */}
        <div className="icon-actions">
          <button className="icon-btn" onClick={onSave} aria-pressed={saved} data-on={saved || undefined}>
            {saved ? <BookmarkCheck size={14} fill="currentColor" /> : <Bookmark size={14} />} Save
          </button>
          <button
            className="icon-btn"
            onClick={() => (token ? setListOpen(true) : router.push(`/auth?next=/courses/${slug}`))}
          >
            <ListPlus size={14} /> List
          </button>
          <button className="icon-btn" onClick={onLike} aria-pressed={liked} data-on={liked || undefined}>
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
            <span>Like</span>
            {likeCount > 0 && <span className="icon-btn__count">{compact(likeCount)}</span>}
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
          {teachers.length > 0 && (
            <section className="rail">
              <div className="section-head"><h2>{teachers.length > 1 ? "Instructors" : "Instructor"}</h2></div>
              <div className="instructor-grid">
                {teachers.map((l) => (
                  <Link key={l.id} href={`/lecturers/${l.slug}`} className="instructor-card">
                    <div className="instructor-card__avatar">
                      {l.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cloudinaryUrl(l.photoUrl, { width: 120, height: 120 }) ?? undefined} alt={l.name} />
                      ) : (
                        l.name.charAt(0)
                      )}
                    </div>
                    <span className="instructor-card__name">{l.name}</span>
                    <span className="instructor-card__role">Instructor</span>
                  </Link>
                ))}
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

          {/* curriculum — only for courses that are actually watched in the app.
              A Telegram archive has no lessons, and the placeholder sections its
              import creates duplicated the file list below. */}
          {curriculum.length > 0 && (
          <section className="rail">
            <div className="section-head">
              <h2>
                Curriculum · {plural(curriculum.length, "module")}
              </h2>
              {course.durationMin > 0 && (
                <span className="muted mono" style={{ fontSize: 10 }}>
                  {formatDuration(course.durationMin)} total
                </span>
              )}
            </div>
            <div className="accordion">
              {curriculum.map((s, i) => (
                <div className="accordion-item" key={s.id}>
                  <button className="accordion-trigger" onClick={() => setOpenSection(openSection === s.id ? null : s.id)}>
                    <span>
                      <span className="eyebrow" style={{ marginRight: 10 }}>{String(i + 1).padStart(2, "0")}</span>
                      {s.title} <span className="muted" style={{ fontSize: 11 }}>· {plural(s.lessons.length, "lesson")}</span>
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
          )}

          {/* downloads analytics — only once there is something to count. A course
              published this morning was rendering four zeros under a heading that
              claims popularity, plus a sparkline that says "No recent download
              activity" about it. Absent is better than empty here. */}
          {course.downloads.total > 0 && (
          <section className="rail">
            <div className="section-head">
              <h2>Downloads on Syncourse</h2>
            </div>
            <div className="dark-panel dark-panel--pad">
              {/* Wraps: four numbers at 28px apart overflowed a 320px phone, and
                  a stat strip that scrolls sideways hides the last stat. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "18px 28px" }}>
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
          )}

          {/* telegram files — the actual course content delivered via Telegram */}
          {course.telegramFiles && course.telegramFiles.length > 0 && (
            <section className="rail" id="files">
              <div className="section-head">
                <h2>Course files</h2>
                <a
                  className="btn primary files-cta"
                  href={botLink(`dl_${course.slug}`)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setToast("Opening Telegram — the bot will send everything")}
                >
                  <Download size={13} /> Download all
                </a>
              </div>
              <div className="files-panel">
                <p className="files-note">
                  Delivered by <strong>@{BOT_USERNAME}</strong> straight to your Telegram chat. Tap a part
                  and only that file is sent — nothing else.
                </p>
                {fileModules.map((m, mi) => (
                  <div className="file-module" key={m.key}>
                    <div className="file-module__head">
                      <span className="file-module__index">{String(mi + 1).padStart(2, "0")}</span>
                      <span className="file-module__title">{m.title ?? "Course archive"}</span>
                      <span className="file-module__meta mono">
                        {plural(m.files.length, "part")}
                        {m.sizeMb > 0 ? ` · ${Math.round(m.sizeMb)} MB` : ""}
                      </span>
                      {m.files.length > 1 && (
                        <a
                          className="btn ghost file-btn"
                          href={botLink(`dlmod_${m.files[0].id}`)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setToast(`Opening Telegram — all ${m.files.length} parts`)}
                        >
                          All parts
                        </a>
                      )}
                    </div>
                    <div className="file-rows">
                      {m.files.map((f) => (
                        <div className="file-row" key={f.id}>
                          <span className="file-row__num mono">{String(f.partIndex).padStart(2, "0")}</span>
                          <span className="file-row__body">
                            <span className="file-row__name">{mediaTitle(f, `Part ${f.partIndex}`)}</span>
                            <span className="file-row__meta mono">
                              {f.fileSizeMb ? `${f.fileSizeMb} MB` : "Telegram attachment"}
                            </span>
                          </span>
                          <a
                            className="btn primary file-btn"
                            href={botLink(`dlf_${f.id}`)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setToast(`Opening Telegram — part ${f.partIndex}`)}
                          >
                            <Download size={13} /> Download
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
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
                <MessageCircle size={13} /> Write
              </button>
            </div>
            {course.reviews.length === 0 && (
              <div className="dark-panel dark-panel--pad-lg" style={{ textAlign: "center" }}>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>No reviews yet — start the thread.</p>
              </div>
            )}
            {course.reviews.slice(0, 8).map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                onUpvote={onUpvote}
                onReply={onReplyToReview}
                onEdit={onEditReview}
                onDelete={onDeleteReview}
              />
            ))}
            </div>

          {/* review composer */}
          <div id="review-box" className="dark-panel dark-panel--pad" style={{ marginTop: 22 }}>
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

      {downloadOpen && (
        /* The tallest dialog on the site — a course with eight modules is a long
           list — so it leans on the panel's pinned header rather than scrolling
           its own title away, and the Telegram row stays at the top where the
           answer to "how do I get this" belongs. */
        <Modal
          open
          onClose={() => setDownloadOpen(false)}
          title="Available downloads"
          subtitle={
            <>
              Lesson files are served through short-lived signed links.{" "}
              <span className="rating">Premium members get full-speed delivery.</span>
            </>
          }
          width={560}
        >
            {/* download via Telegram bot — the bot streams the course file from its group topic */}
            <a
              href={botLink(`dl_${course.slug}`)}
              target="_blank"
              rel="noreferrer"
              className="dark-panel dark-panel--row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid hsl(var(--primary) / .35)",
                background: "hsl(var(--primary) / .08)" }}
            >
              <SendInline />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                Get this course via Telegram
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                  sent straight to your chat
                </span>
              </span>
              <ChevronRight size={14} className="muted" />
            </a>

            {/* Telegram-linked files — surfaced when the bot has attached files to this course */}
            {course.telegramFiles && course.telegramFiles.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "hsl(var(--muted-foreground))" }}>Linked files from Telegram</h4>
                {course.telegramFiles.map((f) => (
                  <a
                    key={f.id}
                    href={botLink(`dlf_${f.id}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="dark-panel dark-panel--pad-sm"
                    style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}
                  >
                    <Download size={14} className="rating" />
                    <span style={{ flex: 1 }}>
                      {f.moduleTitle ? `${f.moduleTitle} · Part ${f.partIndex}` : `Part ${f.partIndex}`}
                      {f.fileName && !isOpaqueFileName(f.fileName) && (
                        <span className="muted mono" style={{ marginLeft: 6, fontSize: 10 }}>{f.fileName}</span>
                      )}
                      {f.fileSizeMb && <span className="muted mono" style={{ marginLeft: 4, fontSize: 10 }}>{f.fileSizeMb} MB</span>}
                    </span>
                    <ChevronRight size={14} className="muted" />
                  </a>
                ))}
              </div>
            )}

            {curriculum.map((s, si) => (
              <div key={s.id} style={{ marginTop: 12 }}>
                {/* bulk download — whole module in one click (phonofilm "Season [Download]") */}
                <div
                  className="dark-panel dark-panel--row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "1px dashed hsl(var(--primary) / .4)",
                    background: "hsl(var(--primary) / .06)" }}
                >
                  <Download size={15} className="rating" />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                    Module {si + 1} — {s.title}
                    <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                      {s.lessons.length} lessons
                    </span>
                  </span>
                  {/* `?bulk=1` was read by nothing — there is no bulk-download
                      route — and an empty lessons[0] produced a broken href.
                      Link to the module's first lesson only when one exists. */}
                  {s.lessons[0] && (
                    <Link href={`/courses/${course.slug}/lessons/${s.lessons[0].id}`} className="btn primary" style={{ padding: "7px 13px", fontSize: 11 }}>
                      Open module
                    </Link>
                  )}
                  <span className="badge" title="Fast, full-speed delivery requires Premium">
                    <ZapInline /> Fast
                  </span>
                </div>
                {/* individual lessons */}
                {s.lessons.map((l) => (
                  <Link
                    key={l.id}
                    href={`/courses/${course.slug}/lessons/${l.id}`}
                    className="dark-panel dark-panel--pad-sm"
                    style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}
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
        </Modal>
      )}

      {listOpen && (
        <AddToListSheet
          courseId={course.id}
          courseTitle={course.title}
          onClose={() => setListOpen(false)}
          onFlash={flash}
        />
      )}

      <Toast message={toast} />
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

function SendInline() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ display: "inline", verticalAlign: "middle", color: "hsl(var(--primary))" }}>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
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

/**
 * One review body, in display or edit mode, with the author's own controls.
 *
 * Editing happens in place — a textarea exactly where the paragraph was — so the
 * thread keeps its scroll position and you can still see what you were replying
 * to while you fix a typo. A modal would cover the one thing you need to read.
 *
 * Shared by reviews and replies: a reply is the same row with a parent, so it
 * gets the same rights over its own words.
 */
function ReviewText({
  row,
  small,
  onEdit,
  onDelete,
}: {
  row: ReviewRow;
  small?: boolean;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fs = small ? 12 : undefined;

  const save = async () => {
    const body = draft.trim();
    if (!body || body === row.body) {
      setEditing(false);
      setDraft(row.body);
      return;
    }
    setBusy(true);
    try {
      await onEdit(row.id, body);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onDelete(row.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (editing) {
    return (
      <div className="review-edit">
        <textarea
          className="form-input"
          rows={small ? 2 : 3}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Edit your review"
        />
        <div className="review-edit__row">
          <button className="btn primary" disabled={busy || !draft.trim()} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => {
              setDraft(row.body);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p style={{ fontSize: fs, margin: small ? "4px 0 0" : undefined }}>
        {row.body}
        {row.editedAt && <span className="review-edited"> · edited</span>}
      </p>
      {row.mine && (
        <div className="review-own">
          {confirming ? (
            <>
              <span className="review-own__ask">
                Delete this {small ? "reply" : "review"}
                {!small && row.replyCount > 0 ? ` and its ${plural(row.replyCount, "reply", "replies")}` : ""}?
              </span>
              <button className="link-btn danger" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="link-btn" disabled={busy} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button className="link-btn" onClick={() => setEditing(true)}>
                <Pencil size={11} /> Edit
              </button>
              <button className="link-btn danger" onClick={() => setConfirming(true)}>
                <Trash2 size={11} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ReviewCard({
  review,
  onUpvote,
  onReply,
  onEdit,
  onDelete,
}: {
  review: ReviewRow;
  onUpvote: (id: string) => void;
  onReply: (parentId: string, body: string) => void;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
        <ReviewText row={review} onEdit={onEdit} onDelete={onDelete} />
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
          <span className="muted mono" style={{ fontSize: 10 }}>{plural(review.replyCount, "reply", "replies")}</span>
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
        <div
          key={rep.id}
          style={{ marginLeft: 16, borderLeft: "2px solid hsl(var(--border))", paddingLeft: 12, marginTop: 10 }}
        >
          <div className="review-top">
            <span>
              <strong style={{ fontSize: 12 }}>{rep.userName}</strong>{" "}
              <span className="muted mono" style={{ fontSize: 10 }}>· {formatDate(rep.createdAt)}</span>
              {rep.isStaff && <span className="badge" style={{ marginLeft: 6 }}>Staff</span>}
            </span>
          </div>
          <ReviewText row={rep} small onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}
