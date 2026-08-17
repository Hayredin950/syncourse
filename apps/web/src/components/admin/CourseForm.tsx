"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post, patch } from "@/lib/api";
import type { AdminCourseDetail, AdminSection } from "@/lib/types";

const CONTENT_TYPES = ["course", "mini-course", "cheat-sheet", "roadmap"];
const LESSON_TYPES = ["video", "article", "quiz", "notes"];
const emptyLesson = { title: "", type: "video", durationSec: 0, videoUrl: "", isPreview: false, fileUrl: "" };

interface Props {
  initial?: AdminCourseDetail;
}

export function CourseForm({ initial }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyField, setBusyField] = useState<"thumb" | "banner" | null>(null);

  const [suggestions, setSuggestions] = useState<{ levels: string[]; categories: string[]; lecturers: string[]; orgs: string[] }>({
    levels: [],
    categories: [],
    lecturers: [],
    orgs: [],
  });

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [contentType, setContentType] = useState(initial?.contentType ?? "course");
  const [language, setLanguage] = useState(initial?.language ?? "English");
  const [levelName, setLevelName] = useState(initial?.levelName ?? "");
  const [lecturerName, setLecturerName] = useState(initial?.lecturerName ?? "");
  const [organizationName, setOrganizationName] = useState(initial?.organizationName ?? "");
  const [categories, setCategories] = useState(initial?.categoryNames.join(", ") ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [audience, setAudience] = useState(initial?.audience.join(", ") ?? "");
  const [prerequisites, setPrerequisites] = useState(initial?.prerequisites ?? "");
  const [originalPrice, setOriginalPrice] = useState(initial?.originalPrice != null ? String(initial.originalPrice) : "");
  const [isPremium, setIsPremium] = useState(initial?.isPremium ?? false);
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnailUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(initial?.bannerUrl ?? "");
  const [previewVideoUrl, setPreviewVideoUrl] = useState(initial?.previewVideoUrl ?? "");
  const [sections, setSections] = useState<AdminSection[]>(
    initial?.sections?.length
      ? initial.sections.map((s) => ({ ...s, lessons: s.lessons.map((l) => ({ ...l, fileUrl: l.fileUrl ?? "" })) }))
      : [{ title: "", lessons: [{ ...emptyLesson }] }],
  );

  const thumbRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      get<{ results: { name: string }[] }>("/levels").catch(() => null),
      get<{ results: { name: string }[] }>("/categories").catch(() => null),
      get<{ results: { name: string }[] }>("/lecturers").catch(() => null),
      get<{ results: { name: string }[] }>("/organizations").catch(() => null),
    ]).then(([l, c, le, o]) =>
      setSuggestions({
        levels: l?.results.map((x) => x.name) ?? [],
        categories: c?.results.map((x) => x.name) ?? [],
        lecturers: le?.results.map((x) => x.name) ?? [],
        orgs: o?.results.map((x) => x.name) ?? [],
      }),
    );
  }, []);

  const uploadImage = async (file: File, field: "thumb" | "banner") => {
    setBusyField(field);
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const up = await post<{ url: string }>("/images/upload", { dataUrl });
      if (field === "thumb") setThumbnailUrl(up.url);
      else setBannerUrl(up.url);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusyField(null);
    }
  };

  const updateSection = (si: number, patch: Partial<AdminSection>) =>
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));

  const updateLesson = (si: number, li: number, patch: Partial<AdminSection["lessons"][number]>) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, lessons: s.lessons.map((l, j) => (j === li ? { ...l, ...patch } : l)) } : s,
      ),
    );

  const save = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      title: title.trim(),
      description: description.trim(),
      contentType,
      language,
      levelName: levelName.trim() || undefined,
      lecturerName: lecturerName.trim() || undefined,
      organizationName: organizationName.trim() || undefined,
      categoryNames: categories.split(",").map((s) => s.trim()).filter(Boolean),
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      audience: audience.split(",").map((s) => s.trim()).filter(Boolean),
      prerequisites: prerequisites.trim() || undefined,
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      isPremium,
      isFeatured,
      thumbnailUrl: thumbnailUrl.trim() || undefined,
      bannerUrl: bannerUrl.trim() || undefined,
      previewVideoUrl: previewVideoUrl.trim() || undefined,
      sections: sections
        .filter((s) => s.title.trim())
        .map((s) => ({
          title: s.title.trim(),
          lessons: s.lessons
            .filter((l) => l.title.trim())
            .map((l) => ({
              title: l.title.trim(),
              type: l.type,
              durationSec: Number(l.durationSec) || 0,
              videoUrl: l.videoUrl?.trim() || undefined,
              isPreview: l.isPreview,
              fileUrl: l.fileUrl?.trim() || undefined,
            })),
        })),
    };
    try {
      if (initial) {
        await patch(`/admin/courses/${initial.slug}`, body);
      } else {
        const created = await post<{ slug: string }>("/admin/courses", body);
        router.replace(`/admin/courses/${created.slug}/edit`);
      }
      router.push("/admin");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed");
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none";
  const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-dim";

  return (
    <div className="space-y-4 p-4">
      <div>
        <label className={labelCls}>Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Complete React Course" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Description *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What will students learn?" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Content type</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputCls}>
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Level</label>
        <input value={levelName} onChange={(e) => setLevelName(e.target.value)} list="adm-levels" placeholder="Beginner / Intermediate / Advanced" className={inputCls} />
        <datalist id="adm-levels">{suggestions.levels.map((l) => <option key={l} value={l} />)}</datalist>
      </div>

      <div>
        <label className={labelCls}>Lecturer</label>
        <input value={lecturerName} onChange={(e) => setLecturerName(e.target.value)} list="adm-lecturers" placeholder="Instructor name" className={inputCls} />
        <datalist id="adm-lecturers">{suggestions.lecturers.map((l) => <option key={l} value={l} />)}</datalist>
      </div>

      <div>
        <label className={labelCls}>Organization / channel</label>
        <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} list="adm-orgs" placeholder="Channel or school name" className={inputCls} />
        <datalist id="adm-orgs">{suggestions.orgs.map((l) => <option key={l} value={l} />)}</datalist>
      </div>

      <div>
        <label className={labelCls}>Categories (comma separated)</label>
        <input value={categories} onChange={(e) => setCategories(e.target.value)} list="adm-cats" placeholder="Programming, AI, Design…" className={inputCls} />
        <datalist id="adm-cats">{suggestions.categories.map((l) => <option key={l} value={l} />)}</datalist>
      </div>

      <div>
        <label className={labelCls}>Tags (comma separated)</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, hooks, frontend…" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Target audience (comma separated)</label>
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="beginners, developers…" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Prerequisites</label>
        <input value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} placeholder="e.g. Basic JavaScript" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Original price ($)</label>
          <input value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} inputMode="decimal" placeholder="49.99" className={inputCls} />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} className="accent-accent" />
            Premium
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="accent-accent" />
            Featured
          </label>
        </div>
      </div>

      {/* media */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dim">Cover image</div>
        <input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="https://… image URL" className={inputCls} />
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => thumbRef.current?.click()} disabled={busyField !== null} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40">
            {busyField === "thumb" ? "Uploading…" : "Upload image"}
          </button>
          {thumbnailUrl && <img src={thumbnailUrl} alt="thumb" className="h-10 w-8 rounded object-cover" />}
        </div>
        <input ref={thumbRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "thumb")} />

        <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-dim">Banner (optional)</div>
        <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://… banner URL" className={inputCls} />
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => bannerRef.current?.click()} disabled={busyField !== null} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40">
            {busyField === "banner" ? "Uploading…" : "Upload banner"}
          </button>
          {bannerUrl && <img src={bannerUrl} alt="banner" className="h-8 w-14 rounded object-cover" />}
        </div>
        <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "banner")} />
      </div>

      <div>
        <label className={labelCls}>Preview video URL (optional)</label>
        <input value={previewVideoUrl} onChange={(e) => setPreviewVideoUrl(e.target.value)} placeholder="https://… mp4 or stream" className={inputCls} />
      </div>

      {/* curriculum */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-dim">Curriculum</span>
          <button
            onClick={() => setSections((p) => [...p, { title: "", lessons: [{ ...emptyLesson }] }])}
            className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-black"
          >
            + Section
          </button>
        </div>
        <div className="space-y-3">
          {sections.map((s, si) => (
            <div key={si} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <input
                  value={s.title}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                  placeholder={`Section ${si + 1} title`}
                  className={inputCls}
                />
                <button
                  onClick={() => setSections((p) => p.filter((_, i) => i !== si))}
                  className="shrink-0 rounded-full border border-danger/40 px-2.5 py-1.5 text-xs text-danger"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {s.lessons.map((l, li) => (
                  <div key={li} className="rounded-md bg-bg p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={l.title}
                        onChange={(e) => updateLesson(si, li, { title: e.target.value })}
                        placeholder="Lesson title"
                        className={inputCls}
                      />
                      <button
                        onClick={() => updateSection(si, { lessons: s.lessons.filter((_, i) => i !== li) })}
                        className="shrink-0 rounded-full border border-danger/40 px-2 py-1 text-[10px] text-danger"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select value={l.type} onChange={(e) => updateLesson(si, li, { type: e.target.value })} className={inputCls}>
                        {LESSON_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        value={String(l.durationSec || "")}
                        onChange={(e) => updateLesson(si, li, { durationSec: Number(e.target.value) || 0 })}
                        placeholder="Seconds"
                        inputMode="numeric"
                        className={inputCls}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={l.videoUrl ?? ""}
                        onChange={(e) => updateLesson(si, li, { videoUrl: e.target.value })}
                        placeholder="Video URL (optional)"
                        className={inputCls}
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                        <input type="checkbox" checked={l.isPreview} onChange={(e) => updateLesson(si, li, { isPreview: e.target.checked })} className="accent-accent" />
                        Preview
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={l.fileUrl ?? ""}
                        onChange={(e) => updateLesson(si, li, { fileUrl: e.target.value })}
                        placeholder="ZIP / file URL (optional — students can download this)"
                        className={inputCls}
                      />
                      {l.fileUrl ? (
                        <span className="shrink-0 rounded bg-accent-soft px-2 py-1 text-[10px] font-bold text-accent">FILE</span>
                      ) : null}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => updateSection(si, { lessons: [...s.lessons, { ...emptyLesson }] })}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
                >
                  + Lesson
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{error}</div>}

      <div className="flex gap-2 pb-8">
        <button onClick={save} disabled={saving} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-black disabled:opacity-50">
          {saving ? "Saving…" : initial ? "Save changes" : "Create course"}
        </button>
        <button onClick={() => router.push("/admin")} className="rounded-full border border-border px-4 text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </div>
  );
}
