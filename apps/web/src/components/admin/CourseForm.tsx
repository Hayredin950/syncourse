"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { get, post, patch } from "@/lib/api";
import type { AdminCourseDetail, AdminSection } from "@/lib/types";
import { useAdminToast } from "./AdminToast";

const CONTENT_TYPES = ["course", "mini-course", "cheat-sheet", "roadmap"];
const LESSON_TYPES = ["video", "article", "quiz", "notes"];
const emptyLesson = { title: "", type: "video", durationSec: 0, videoUrl: "", isPreview: false, fileUrl: "" };

interface Props {
  initial?: AdminCourseDetail;
}

export function CourseForm({ initial }: Props) {
  const router = useRouter();
  const toast = useAdminToast();
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
        toast.success(`“${body.title}” saved`);
        router.push(`/admin/courses/detail?slug=${initial.slug}`);
      } else {
        const created = await post<{ slug: string }>("/admin/courses", body);
        toast.success(`“${body.title}” created`);
        router.push(`/admin/courses/detail?slug=${created.slug}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="admin-stack">
      <div className="admin-card">
        <h3>Basics</h3>
        <div className="admin-form-grid">
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Title</span>
            <input
              className="admin-input admin-input--full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete React Course"
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Description</span>
            <textarea
              className="admin-textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn?"
            />
          </label>
          <label className="admin-field">
            <span className="admin-label">Content type</span>
            <select
              className="admin-select admin-input--full"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span className="admin-label">Language</span>
            <input
              className="admin-input admin-input--full"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Attribution</h3>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span className="admin-label">Level</span>
            <input
              className="admin-input admin-input--full"
              value={levelName}
              onChange={(e) => setLevelName(e.target.value)}
              list="adm-levels"
              placeholder="Beginner / Intermediate / Advanced"
            />
            <datalist id="adm-levels">
              {suggestions.levels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="admin-field">
            <span className="admin-label">Lecturer</span>
            <input
              className="admin-input admin-input--full"
              value={lecturerName}
              onChange={(e) => setLecturerName(e.target.value)}
              list="adm-lecturers"
              placeholder="Instructor name"
            />
            <datalist id="adm-lecturers">
              {suggestions.lecturers.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="admin-field">
            <span className="admin-label">Publisher or channel</span>
            <input
              className="admin-input admin-input--full"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              list="adm-orgs"
              placeholder="Channel or school name"
            />
            <datalist id="adm-orgs">
              {suggestions.orgs.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="admin-field">
            <span className="admin-label">Categories</span>
            <input
              className="admin-input admin-input--full"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              list="adm-cats"
              placeholder="Programming, AI, Design…"
            />
            <datalist id="adm-cats">
              {suggestions.categories.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <span className="admin-field__hint">Comma separated. Existing names autocomplete.</span>
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Positioning &amp; pricing</h3>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span className="admin-label">Tags</span>
            <input
              className="admin-input admin-input--full"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="react, hooks, frontend…"
            />
          </label>
          <label className="admin-field">
            <span className="admin-label">Target audience</span>
            <input
              className="admin-input admin-input--full"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="beginners, developers…"
            />
          </label>
          <label className="admin-field">
            <span className="admin-label">Prerequisites</span>
            <input
              className="admin-input admin-input--full"
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              placeholder="e.g. Basic JavaScript"
            />
          </label>
          <label className="admin-field">
            <span className="admin-label">Original price ($)</span>
            <input
              className="admin-input admin-input--full"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              inputMode="decimal"
              placeholder="49.99"
            />
          </label>
          <div className="admin-field admin-field--wide">
            <span className="admin-label">Visibility</span>
            <div className="admin-inline" style={{ gap: 16 }}>
              <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={isPremium}
                  onChange={(e) => setIsPremium(e.target.checked)}
                />
                Premium only
              </label>
              <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                />
                Featured on the home page
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Media</h3>
        <div className="admin-form-grid">
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Cover image</span>
            <input
              className="admin-input admin-input--full"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://… image URL"
            />
          </label>
        </div>
        <div className="admin-inline" style={{ marginTop: -6, marginBottom: 14 }}>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={() => thumbRef.current?.click()}
            disabled={busyField !== null}
          >
            {busyField === "thumb" ? "Uploading…" : "Upload image"}
          </button>
          {thumbnailUrl && (
            <span className="admin-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnailUrl} alt="Cover preview" style={{ width: 32, height: 42 }} />
              <button
                type="button"
                className="admin-preview__x"
                title="Remove cover"
                aria-label="Remove cover"
                onClick={() => setThumbnailUrl("")}
              >
                <X size={10} />
              </button>
            </span>
          )}
        </div>
        <input ref={thumbRef} type="file" accept="image/*" className="admin-sr" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "thumb")} />

        <div className="admin-form-grid">
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Banner</span>
            <input
              className="admin-input admin-input--full"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://… banner URL"
            />
          </label>
        </div>
        <div className="admin-inline" style={{ marginTop: -6, marginBottom: 14 }}>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={() => bannerRef.current?.click()}
            disabled={busyField !== null}
          >
            {busyField === "banner" ? "Uploading…" : "Upload banner"}
          </button>
          {bannerUrl && (
            <span className="admin-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bannerUrl} alt="Banner preview" style={{ width: 56, height: 32 }} />
              <button
                type="button"
                className="admin-preview__x"
                title="Remove banner"
                aria-label="Remove banner"
                onClick={() => setBannerUrl("")}
              >
                <X size={10} />
              </button>
            </span>
          )}
        </div>
        <input ref={bannerRef} type="file" accept="image/*" className="admin-sr" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "banner")} />

        <div className="admin-form-grid" style={{ marginBottom: 0 }}>
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Preview video URL</span>
            <input
              className="admin-input admin-input--full"
              value={previewVideoUrl}
              onChange={(e) => setPreviewVideoUrl(e.target.value)}
              placeholder="https://… mp4 or stream"
            />
            <span className="admin-field__hint">Optional. Plays on the course page before enrolment.</span>
          </label>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-panel__head">
          <span className="admin-panel__title">Curriculum</span>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            onClick={() => setSections((p) => [...p, { title: "", lessons: [{ ...emptyLesson }] }])}
          >
            <Plus size={12} /> Add section
          </button>
        </div>
        <div className="admin-stack" style={{ gap: 10 }}>
          {sections.length === 0 && (
            <p className="admin-empty" style={{ padding: "18px 0" }}>
              No sections yet. A course needs at least one to be worth publishing.
            </p>
          )}
          {sections.map((s, si) => (
            <div key={si} className="admin-subcard">
              <div className="admin-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input
                  className="admin-input admin-input--full"
                  value={s.title}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                  placeholder={`Section ${si + 1} title`}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn--danger admin-btn--icon"
                  aria-label={`Remove section ${si + 1}`}
                  onClick={() => setSections((p) => p.filter((_, i) => i !== si))}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="admin-stack" style={{ gap: 8, marginTop: 10 }}>
                {s.lessons.map((l, li) => (
                  <div key={li} className="admin-subcard" style={{ background: "var(--adm-raised)" }}>
                    <div className="admin-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <input
                        className="admin-input admin-input--full"
                        value={l.title}
                        onChange={(e) => updateLesson(si, li, { title: e.target.value })}
                        placeholder={`Lesson ${li + 1} title`}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn--quiet admin-btn--icon"
                        aria-label={`Remove lesson ${li + 1}`}
                        onClick={() => updateSection(si, { lessons: s.lessons.filter((_, i) => i !== li) })}
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="admin-form-grid" style={{ marginTop: 8, marginBottom: 0, gap: 8 }}>
                      <label className="admin-field">
                        <span className="admin-label">Type</span>
                        <select
                          className="admin-select admin-input--full"
                          value={l.type}
                          onChange={(e) => updateLesson(si, li, { type: e.target.value })}
                        >
                          {LESSON_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span className="admin-label">Duration (seconds)</span>
                        <input
                          className="admin-input admin-input--full"
                          value={String(l.durationSec || "")}
                          onChange={(e) => updateLesson(si, li, { durationSec: Number(e.target.value) || 0 })}
                          placeholder="0"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="admin-field admin-field--wide">
                        <span className="admin-label">Video URL</span>
                        <div className="admin-inline" style={{ gap: 12, flexWrap: "nowrap" }}>
                          <input
                            className="admin-input admin-input--full"
                            value={l.videoUrl ?? ""}
                            onChange={(e) => updateLesson(si, li, { videoUrl: e.target.value })}
                            placeholder="https://… optional"
                          />
                          <span
                            className="admin-inline"
                            style={{ gap: 6, flexShrink: 0, fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            <input
                              type="checkbox"
                              className="admin-check"
                              checked={l.isPreview}
                              onChange={(e) => updateLesson(si, li, { isPreview: e.target.checked })}
                            />
                            Free preview
                          </span>
                        </div>
                      </label>
                      <label className="admin-field admin-field--wide">
                        <span className="admin-label">Downloadable file</span>
                        <input
                          className="admin-input admin-input--full"
                          value={l.fileUrl ?? ""}
                          onChange={(e) => updateLesson(si, li, { fileUrl: e.target.value })}
                          placeholder="ZIP or file URL — students can download this"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    onClick={() => updateSection(si, { lessons: [...s.lessons, { ...emptyLesson }] })}
                  >
                    <Plus size={12} /> Add lesson
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--bad" role="alert">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="admin-form-actions" style={{ paddingBottom: 20 }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create course"}
        </button>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => router.push("/admin/courses")}>
          Cancel
        </button>
        <span className="admin-field__hint" style={{ marginLeft: 4 }}>
          Sections and lessons without a title are dropped on save.
        </span>
      </div>
    </div>
  );
}
