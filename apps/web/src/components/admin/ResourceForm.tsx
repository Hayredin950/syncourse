"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Paperclip, Plus, Trash2 } from "lucide-react";
import { get, patch, post } from "@/lib/api";
import type {
  AdminCategoryRow,
  AdminLecturerRow,
  AdminPublisherRow,
  AdminResourceDetail,
  AdminResourceMedia,
  ResourceMediaKind,
} from "@/lib/types";
import type { UploadKind } from "@/lib/upload";
import { Markdown } from "@/components/Markdown";
import { useAdminToast } from "./AdminToast";
import UploadField from "./UploadField";
import { EntityPicker, MultiEntityPicker, type PickerOption } from "./EntityPicker";

/**
 * The authoring form for cheat-sheets, roadmaps and notes.
 *
 * Deliberately not CourseForm. A resource is one published post: a body of
 * markdown and a handful of attachments in whatever formats the original had —
 * image, video, PDF, doc, spreadsheet, another markdown file. It has no
 * curriculum, no level, no price and no duration, so a form that asked for them
 * left two thirds of itself blank and produced rows the site could not render.
 */

const RESOURCE_TYPES = [
  { value: "cheat-sheet", label: "Cheat-sheet", hint: "A reference you keep open while working." },
  { value: "roadmap", label: "Roadmap", hint: "An ordered path through a subject." },
  { value: "note", label: "Useful note", hint: "A short write-up, tip or explainer." },
] as const;

/**
 * `upload` is the Cloudinary bucket the picker signs for this kind — `null`
 * means the row is a link to somewhere else and there is nothing to upload.
 */
const MEDIA_KINDS: { value: ResourceMediaKind; label: string; upload: UploadKind | null }[] = [
  { value: "image", label: "Image", upload: "image" },
  { value: "video", label: "Video", upload: "video" },
  { value: "audio", label: "Audio", upload: "file" },
  { value: "pdf", label: "PDF", upload: "file" },
  { value: "doc", label: "Document", upload: "file" },
  { value: "sheet", label: "Spreadsheet", upload: "file" },
  { value: "slide", label: "Slides", upload: "file" },
  { value: "archive", label: "Archive (zip)", upload: "file" },
  { value: "code", label: "Code / markdown", upload: "file" },
  { value: "link", label: "Link", upload: null },
  { value: "other", label: "Other file", upload: "file" },
];

const emptyMedia = (): AdminResourceMedia => ({
  kind: "image",
  url: "",
  fileName: "",
  fileSizeMb: null,
  caption: "",
});

const courseCount = (n: number) => (n === 1 ? "1 course" : `${n} courses`);

/** Same estimate the API uses, so the hint matches what readers will be told. */
function readEstimate(bodyMd: string): number {
  const prose = bodyMd
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|-]/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export function ResourceForm({ initial }: { initial?: AdminResourceDetail }) {
  const router = useRouter();
  const toast = useAdminToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [bodyView, setBodyView] = useState<"write" | "preview">("write");

  const [type, setType] = useState(initial?.type ?? "cheat-sheet");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [bodyMd, setBodyMd] = useState(initial?.bodyMd ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [categoryName, setCategoryName] = useState(initial?.categoryName ?? "");
  const [lecturerName, setLecturerName] = useState(initial?.lecturerName ?? "");
  const [organizationName, setOrganizationName] = useState(initial?.organizationName ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [isPremium, setIsPremium] = useState(initial?.isPremium ?? false);
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [readMinutes, setReadMinutes] = useState(initial?.readMinutes ? String(initial.readMinutes) : "");
  const [media, setMedia] = useState<AdminResourceMedia[]>(initial?.media ?? []);

  const [options, setOptions] = useState<{
    categories: PickerOption[];
    lecturers: PickerOption[];
    orgs: PickerOption[];
  }>({ categories: [], lecturers: [], orgs: [] });

  // The admin lists, not the public ones: `GET /categories` hides any category
  // with no courses, which is exactly the one just created and being attached.
  useEffect(() => {
    Promise.all([
      get<AdminCategoryRow[]>("/admin/categories").catch(() => []),
      get<AdminLecturerRow[]>("/admin/lecturers").catch(() => []),
      get<AdminPublisherRow[]>("/admin/publishers").catch(() => []),
    ]).then(([cats, lecturers, orgs]) =>
      setOptions({
        categories: cats.map((c) => ({ name: c.name, icon: c.icon, meta: courseCount(c.courseCount) })),
        lecturers: lecturers.map((l) => ({ name: l.name, image: l.photoUrl, meta: courseCount(l.courseCount) })),
        orgs: orgs.map((o) => ({ name: o.name, image: o.logoUrl, meta: `${o.orgType} · ${courseCount(o.courseCount)}` })),
      }),
    );
  }, []);

  const estimate = useMemo(() => readEstimate(bodyMd), [bodyMd]);
  const typeMeta = RESOURCE_TYPES.find((t) => t.value === type) ?? RESOURCE_TYPES[0];

  const setRow = (i: number, next: Partial<AdminResourceMedia>) =>
    setMedia((prev) => prev.map((m, j) => (j === i ? { ...m, ...next } : m)));

  const move = (i: number, delta: number) =>
    setMedia((prev) => {
      const to = i + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  const save = async () => {
    if (!title.trim()) {
      setError("A title is required");
      return;
    }
    if (!bodyMd.trim() && media.every((m) => !m.url.trim())) {
      setError("Add a body or at least one attachment — an empty resource has nothing to show.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      type,
      title: title.trim(),
      summary: summary.trim(),
      bodyMd,
      coverUrl: coverUrl.trim(),
      categoryName: categoryName.trim(),
      lecturerName: lecturerName.trim(),
      organizationName: organizationName.trim(),
      tags,
      isPremium,
      isFeatured,
      sourceUrl: sourceUrl.trim(),
      readMinutes: readMinutes ? Number(readMinutes) : 0,
      media: media
        .filter((m) => m.url.trim() || m.caption.trim())
        .map((m) => ({
          kind: m.kind,
          url: m.url.trim(),
          fileName: m.fileName.trim(),
          fileSizeMb: m.fileSizeMb ?? undefined,
          caption: m.caption.trim(),
        })),
    };
    try {
      if (initial) {
        await patch(`/admin/resources/${initial.slug}`, body);
        toast.success(`“${body.title}” saved`);
      } else {
        await post<{ slug: string }>("/admin/resources", body);
        toast.success(`“${body.title}” created`);
      }
      router.push("/admin/resources");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="admin-stack">
      <div className="admin-card">
        <h3>Basics</h3>
        <div className="admin-seg" role="group" aria-label="Resource type" style={{ marginBottom: 14 }}>
          {RESOURCE_TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => setType(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="page-desc" style={{ marginTop: -8 }}>
          {typeMeta.hint}
        </p>
        <div className="admin-form-grid">
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Title</span>
            <input
              className="admin-input admin-input--full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pandas indexing cheat-sheet"
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Summary</span>
            <input
              className="admin-input admin-input--full"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line — what it covers and when to reach for it."
            />
            <span className="admin-field__hint">
              Shown on cards and in search results. Left blank, the first line of the body is used.
            </span>
          </label>
          <UploadField
            label="Cover image"
            kind="image"
            value={coverUrl}
            onChange={setCoverUrl}
            placeholder="https://… or upload"
            preview={{ width: 132, height: 74 }}
            hint="Optional. Without one the card falls back to the category icon."
          />
        </div>
      </div>

      <div className="admin-card">
        <h3>Attribution</h3>
        <p className="page-desc" style={{ marginTop: -4 }}>
          The same rows the courses use, so a cheat-sheet lands in the category people already browse. A name
          that matches nothing is created on save — pick from the list where you can.
        </p>
        <div className="admin-form-grid">
          <EntityPicker
            label="Category"
            value={categoryName}
            onChange={setCategoryName}
            options={options.categories}
            placeholder="Choose a category"
            createNote="will be added as a new category"
            emptyNote="No categories yet."
          />
          <EntityPicker
            label="Author"
            value={lecturerName}
            onChange={setLecturerName}
            options={options.lecturers}
            placeholder="Who wrote it"
            createNote="will be added as a new lecturer"
            emptyNote="No lecturers yet."
          />
          <EntityPicker
            label="Publisher"
            value={organizationName}
            onChange={setOrganizationName}
            options={options.orgs}
            placeholder="Channel or school"
            createNote="will be added as a new publisher"
            emptyNote="No publishers yet."
          />
          <MultiEntityPicker
            label="Tags"
            values={tags}
            onChange={setTags}
            options={[]}
            placeholder="python, dataframes…"
            hint="Free text. Tags are how the resource library cross-links."
            emptyNote="Type a tag and press Enter."
            wide
          />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-inline" style={{ justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Body</h3>
          <div className="md-tabs">
            {(["write", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`md-tab ${bodyView === v ? "is-active" : ""}`}
                onClick={() => setBodyView(v)}
              >
                {v === "write" ? "Write" : "Preview"}
              </button>
            ))}
          </div>
        </div>
        {bodyView === "write" ? (
          <textarea
            className="admin-textarea"
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={16}
            style={{ minHeight: 300, fontFamily: "var(--app-font-mono)" }}
            placeholder={"## Selecting rows\n\n`df.loc[...]` selects by **label**.\n\n| method | selects by |\n| --- | --- |\n| loc | label |\n| iloc | position |"}
          />
        ) : (
          <div className="md-preview">
            {bodyMd.trim() ? <Markdown text={bodyMd} /> : <span className="admin-dim">Nothing to preview yet.</span>}
          </div>
        )}
        <span className="admin-field__hint">
          {bodyMd.length.toLocaleString("en-US")} characters · reads in about {estimate} min. Markdown renders in
          full for readers — headings, bold, lists, code, links, images and tables.
        </span>
      </div>

      <div className="admin-card">
        <div className="admin-inline" style={{ justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            <Paperclip size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Attachments
          </h3>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={() => setMedia((p) => [...p, emptyMedia()])}
          >
            <Plus size={12} /> Add attachment
          </button>
        </div>
        <p className="page-desc" style={{ marginTop: 2 }}>
          Whatever the original post carried, in the order it should appear. Images and video play inline on the
          site, PDFs open in a reader, and everything else becomes a download row — the kind is what decides.
        </p>

        {media.length === 0 && (
          <p className="admin-empty" style={{ margin: 0 }}>
            No attachments. A text-only resource is fine — the body alone renders.
          </p>
        )}

        <div className="admin-stack" style={{ gap: 12 }}>
          {media.map((m, i) => {
            const kindMeta = MEDIA_KINDS.find((k) => k.value === m.kind) ?? MEDIA_KINDS[0];
            return (
              <div key={i} className="admin-subcard">
                <div className="admin-inline" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span className="admin-label" style={{ margin: 0 }}>
                    {i + 1}. {kindMeta.label}
                  </span>
                  <span className="admin-inline" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--quiet admin-btn--icon"
                      aria-label={`Move attachment ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--quiet admin-btn--icon"
                      aria-label={`Move attachment ${i + 1} down`}
                      disabled={i === media.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--quiet admin-btn--icon"
                      aria-label={`Remove attachment ${i + 1}`}
                      onClick={() => setMedia((p) => p.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span className="admin-label">Kind</span>
                    <select
                      className="admin-select admin-input--full"
                      value={m.kind}
                      onChange={(e) => setRow(i, { kind: e.target.value as ResourceMediaKind })}
                    >
                      {MEDIA_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span className="admin-label">Size (MB)</span>
                    <input
                      className="admin-input admin-input--full"
                      inputMode="decimal"
                      value={m.fileSizeMb == null ? "" : String(m.fileSizeMb)}
                      onChange={(e) =>
                        setRow(i, { fileSizeMb: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder="optional"
                    />
                  </label>
                  {kindMeta.upload ? (
                    <UploadField
                      label="File or URL"
                      kind={kindMeta.upload}
                      value={m.url}
                      onChange={(url) => setRow(i, { url })}
                      placeholder="https://… or upload"
                      preview={m.kind === "image" ? { width: 132, height: 74 } : undefined}
                    />
                  ) : (
                    <label className="admin-field admin-field--wide">
                      <span className="admin-label">URL</span>
                      <input
                        className="admin-input admin-input--full"
                        value={m.url}
                        onChange={(e) => setRow(i, { url: e.target.value })}
                        placeholder="https://t.me/channel/123"
                      />
                    </label>
                  )}
                  <label className="admin-field">
                    <span className="admin-label">Display name</span>
                    <input
                      className="admin-input admin-input--full"
                      value={m.fileName}
                      onChange={(e) => setRow(i, { fileName: e.target.value })}
                      placeholder="Taken from the URL if blank"
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-label">Caption</span>
                    <input
                      className="admin-input admin-input--full"
                      value={m.caption}
                      onChange={(e) => setRow(i, { caption: e.target.value })}
                      placeholder="Shown under the image or beside the download"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-card">
        <h3>Publishing</h3>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span className="admin-label">Reading time (min)</span>
            <input
              className="admin-input admin-input--full"
              inputMode="numeric"
              value={readMinutes}
              onChange={(e) => setReadMinutes(e.target.value)}
              placeholder={String(estimate)}
            />
            <span className="admin-field__hint">Blank uses the estimate: {estimate} min.</span>
          </label>
          <label className="admin-field">
            <span className="admin-label">Original post</span>
            <input
              className="admin-input admin-input--full"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://t.me/channel/123"
            />
            <span className="admin-field__hint">Optional. Linked as “View the original”.</span>
          </label>
        </div>
        <div className="admin-stack" style={{ gap: 9, marginTop: 4 }}>
          <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              className="admin-check"
              checked={isPremium}
              onChange={(e) => setIsPremium(e.target.checked)}
            />
            <span>
              Premium<span className="admin-dim"> — marked for subscribers</span>
            </span>
          </label>
          <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              className="admin-check"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            <span>
              Featured<span className="admin-dim"> — pinned to the top of the resources page</span>
            </span>
          </label>
        </div>
      </div>

      {error && <div className="admin-alert admin-alert--warn">{error}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create resource"}
        </button>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => router.push("/admin/resources")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
