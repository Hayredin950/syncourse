"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListTree, Plus, Trash2, X } from "lucide-react";
import { get, post, patch } from "@/lib/api";
import { plural } from "@/lib/format";
import type {
  AdminCategoryRow,
  AdminCourseDetail,
  AdminLecturerRow,
  AdminPublisherRow,
  AdminSection,
} from "@/lib/types";
import { useAdminToast } from "./AdminToast";
import AdminEmpty from "./AdminEmpty";
import AdminFold from "./AdminFold";
import UploadField from "./UploadField";
import { EntityPicker, MultiEntityPicker, type PickerOption } from "./EntityPicker";

/**
 * Only the two teachable formats.
 *
 * Cheat-sheets, roadmaps and notes are single Telegram posts — a few files and a
 * body of text, no lecturer, no curriculum, no price. They are authored under
 * Admin → Resources with a form of their own, so offering them here only ever
 * produced a "course" that could never be filled in.
 */
const CONTENT_TYPES = [
  { value: "course", label: "Course" },
  { value: "mini-course", label: "Mini-course" },
];
const LESSON_TYPES = ["video", "article", "quiz", "notes"];
const emptyLesson = { title: "", type: "video", durationSec: 0, videoUrl: "", isPreview: false, fileUrl: "" };
const courseCount = (n: number) => (n === 1 ? "1 course" : `${n} courses`);

interface Props {
  initial?: AdminCourseDetail;
}

export function CourseForm({ initial }: Props) {
  const router = useRouter();
  const toast = useAdminToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [options, setOptions] = useState<{
    levels: PickerOption[];
    categories: PickerOption[];
    lecturers: PickerOption[];
    orgs: PickerOption[];
  }>({ levels: [], categories: [], lecturers: [], orgs: [] });


  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [contentType, setContentType] = useState(initial?.contentType ?? "course");
  const [language, setLanguage] = useState(initial?.language ?? "English");
  const [levelName, setLevelName] = useState(initial?.levelName ?? "");
  // A course can be taught by several people. `lecturerNames` is the real field;
  // the one-name fallback keeps the form filled if the API has not shipped the
  // new shape yet.
  const [lecturerNames, setLecturerNames] = useState<string[]>(
    initial?.lecturerNames?.length
      ? initial.lecturerNames
      : initial?.lecturerName
        ? [initial.lecturerName]
        : [],
  );
  const [organizationName, setOrganizationName] = useState(initial?.organizationName ?? "");
  const [categories, setCategories] = useState<string[]>(initial?.categoryNames ?? []);
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

  /**
   * The pickers read the *admin* lists, not the public ones. Two reasons, both
   * of which used to make this form lie: `GET /categories` hides any category
   * with no courses yet, which is exactly the category you just created and are
   * trying to attach; and every public list returns a bare array, while this
   * effect used to read `.results` off it — so the read threw, no state was set,
   * and all four suggestion lists were permanently empty. Levels have no admin
   * route and the public one is unfiltered, so that one stays.
   */
  useEffect(() => {
    Promise.all([
      get<{ name: string }[]>("/levels").catch(() => []),
      get<AdminCategoryRow[]>("/admin/categories").catch(() => []),
      get<AdminLecturerRow[]>("/admin/lecturers").catch(() => []),
      get<AdminPublisherRow[]>("/admin/publishers").catch(() => []),
    ]).then(([levels, cats, lecturers, orgs]) =>
      setOptions({
        levels: levels.map((l) => ({ name: l.name })),
        categories: cats.map((c) => ({ name: c.name, icon: c.icon, meta: courseCount(c.courseCount) })),
        lecturers: lecturers.map((l) => ({ name: l.name, image: l.photoUrl, meta: courseCount(l.courseCount) })),
        orgs: orgs.map((o) => ({ name: o.name, image: o.logoUrl, meta: `${o.orgType} · ${courseCount(o.courseCount)}` })),
      }),
    );
  }, []);

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
      lecturerNames: lecturerNames.map((s) => s.trim()).filter(Boolean),
      organizationName: organizationName.trim() || undefined,
      categoryNames: categories.map((s) => s.trim()).filter(Boolean),
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

  // Fold summaries. A collapsed section on a phone should still say whether it
  // has anything in it — otherwise the accordion hides the fact that the cover
  // image was never set.
  const setOf = (...vals: unknown[]) => `${vals.filter(Boolean).length} of ${vals.length} set`;
  const formatLabel = CONTENT_TYPES.find((t) => t.value === contentType)?.label ?? contentType;
  const attributionHint = setOf(levelName, lecturerNames.length, organizationName, categories.length);
  const positioningHint = setOf(tags.trim(), audience.trim(), prerequisites.trim(), originalPrice.trim());
  const mediaHint = setOf(thumbnailUrl, bannerUrl, previewVideoUrl);
  const lessonCount = sections.reduce((a, s) => a + s.lessons.length, 0);

  return (
    <>
      <div className="admin-form-split">
        <div className="admin-form-split__main">
          <div className="admin-card">
            <h3>Basics</h3>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
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
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will students learn?"
                />
              </label>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-panel__head">
              <span className="admin-inline" style={{ gap: 8 }}>
                <span className="admin-panel__title">Curriculum</span>
                <span className="admin-section-head__hint">
                  {plural(sections.length, "section")} · {plural(lessonCount, "lesson")}
                </span>
              </span>
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
                <AdminEmpty
                  icon={<ListTree size={18} />}
                  title="No sections yet"
                  hint="A course needs at least one to be worth publishing."
                  action={{
                    label: "Add the first section",
                    onClick: () => setSections([{ title: "", lessons: [{ ...emptyLesson }] }]),
                  }}
                />
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
                          <UploadField
                            label="Video"
                            kind="video"
                            value={l.videoUrl ?? ""}
                            onChange={(url) => updateLesson(si, li, { videoUrl: url })}
                            placeholder="https://… or upload an mp4"
                            aside={
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
                            }
                          />
                          <UploadField
                            label="Downloadable file"
                            kind="file"
                            value={l.fileUrl ?? ""}
                            onChange={(url) => updateLesson(si, li, { fileUrl: url })}
                            placeholder="ZIP or file URL — students can download this"
                            hint="Small attachments only. Full course archives belong on Telegram — link them from the course page."
                          />
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
        </div>

        <div className="admin-form-split__aside">
          <AdminFold title="Format" hint={`${formatLabel} · ${language || "no language"}`}>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
              <label className="admin-field">
                <span className="admin-label">Content type</span>
                <select
                  className="admin-select admin-input--full"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                >
                  {CONTENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                  {/* An older row may still carry cheat-sheet or roadmap. Keeping its
                      own value selectable stops a plain save from silently retyping
                      it as a course. */}
                  {!CONTENT_TYPES.some((t) => t.value === contentType) && (
                    <option value={contentType}>{contentType}</option>
                  )}
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
          </AdminFold>
          <AdminFold title="Attribution" hint={attributionHint} collapseOnPhone>
            <p className="page-desc" style={{ marginTop: -4 }}>
              All four are shared rows with their own pages. Pick from the list where you can — a name that matches
              nothing is created on save, so a typo quietly becomes a second lecturer or a second category.
            </p>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
              <EntityPicker
                label="Level"
                value={levelName}
                onChange={setLevelName}
                options={options.levels}
                placeholder="Choose a level"
                createNote="will be added as a new level"
                emptyNote="No levels defined yet."
              />
              <MultiEntityPicker
                label="Lecturers"
                values={lecturerNames}
                onChange={setLecturerNames}
                options={options.lecturers}
                placeholder="Search or type an instructor name"
                emptyNote="No lecturers yet — type a name to add one."
                hint="Add everyone who teaches it; they are credited in the order you add them. Photo and bio are set on the Lecturers page."
              />
              <EntityPicker
                label="Publisher or channel"
                value={organizationName}
                onChange={setOrganizationName}
                options={options.orgs}
                placeholder="Search or type a publisher"
                createNote="will be added as a new publisher"
                emptyNote="No publishers yet — type a name to add one."
                hint="Who produced the course, not where you found the files."
              />
              <MultiEntityPicker
                label="Categories"
                values={categories}
                onChange={setCategories}
                options={options.categories}
                placeholder="Search categories…"
                emptyNote="No categories yet — type a name to add one."
                hint="Click to add or remove. Highlighted chips do not exist yet and will be created on save."
              />
            </div>
          </AdminFold>
          <AdminFold title="Positioning &amp; pricing" hint={positioningHint} collapseOnPhone>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
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
          </AdminFold>
          <AdminFold title="Media" hint={mediaHint} collapseOnPhone>
            <p className="page-desc" style={{ marginTop: -4 }}>
              Paste a link, or upload straight from this machine — the file goes directly to Cloudinary, so size is
              limited by your Cloudinary plan rather than by this form.
            </p>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
              <UploadField
                label="Cover image"
                kind="image"
                value={thumbnailUrl}
                onChange={setThumbnailUrl}
                placeholder="https://… image URL"
                preview={{ width: 32, height: 42 }}
                hint="Portrait works best — it is the card image everywhere in the catalogue."
              />
              <UploadField
                label="Banner"
                kind="image"
                value={bannerUrl}
                onChange={setBannerUrl}
                placeholder="https://… banner URL"
                preview={{ width: 56, height: 32 }}
                hint="Wide image behind the course title."
              />
              <UploadField
                label="Preview video"
                kind="video"
                value={previewVideoUrl}
                onChange={setPreviewVideoUrl}
                placeholder="https://… mp4 or stream"
                hint="Optional. Plays on the course page before downloading."
              />
            </div>
          </AdminFold>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--bad" role="alert">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="admin-form-actions admin-form-actions--sticky" style={{ marginBottom: 20 }}>
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
    </>
  );
}
