"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { get, patch, post } from "@/lib/api";
import type {
  AdminCategoryRow,
  AdminLecturerRow,
  AdminPublisherRow,
  AdminResourceDetail,
  AdminResourceMedia,
  ResourceMediaKind,
} from "@/lib/types";
import { uploadFile, type UploadKind } from "@/lib/upload";
import { Markdown } from "@/components/Markdown";
import { useAdminToast } from "./AdminToast";
import AdminEmpty from "./AdminEmpty";
import AdminFold from "./AdminFold";
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

const uploadBucket = (kind: ResourceMediaKind): UploadKind =>
  MEDIA_KINDS.find((k) => k.value === kind)?.upload ?? "file";

/**
 * Guess the row kind from what the browser already knows about the file, so a
 * dropped folder of screenshots and PDFs lands as the right kinds without the
 * author touching eleven selects. MIME type first — it is what the browser is
 * sure about — then the extension, which is all we get for `.md`, `.zip` and
 * the office formats Chrome reports as `application/octet-stream`.
 */
const EXT_KINDS: [ResourceMediaKind, string[]][] = [
  ["pdf", ["pdf"]],
  ["doc", ["doc", "docx", "odt", "rtf", "txt", "pages"]],
  ["sheet", ["xls", "xlsx", "csv", "tsv", "ods", "numbers"]],
  ["slide", ["ppt", "pptx", "odp", "key"]],
  ["archive", ["zip", "rar", "7z", "tar", "gz", "tgz"]],
  ["code", ["md", "markdown", "json", "yml", "yaml", "py", "js", "ts", "tsx", "jsx", "ipynb", "sh", "sql", "css", "html"]],
];

function detectKind(file: File): ResourceMediaKind {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return EXT_KINDS.find(([, exts]) => exts.includes(ext))?.[0] ?? "other";
}

const asMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 100) / 100;

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

/**
 * What a collapsed row has to say: the name it will show readers, then its size.
 * A hand-pasted URL stands in for a missing display name — it is the only honest
 * thing left, and `t.me/channel/123` is genuinely informative where a Cloudinary
 * public id dressed up as a title would not be.
 */
const rowSummary = (m: AdminResourceMedia): string => {
  const name = m.fileName.trim() || m.url.trim() || "nothing attached yet";
  return m.fileSizeMb ? `${name} · ${m.fileSizeMb} MB` : name;
};

/**
 * One attachment, as a disclosure.
 *
 * Same hydration rule as AdminFold: rendered open, then folded in an effect,
 * because a static export ships one HTML file to every width and deciding from
 * the viewport during render would mismatch what the build produced. A row with
 * no file yet stays open at every width — someone who just tapped "Add row" is
 * about to fill it in.
 */
function MediaRow({
  m,
  i,
  total,
  onChange,
  onMove,
  onRemove,
  onFiles,
}: {
  m: AdminResourceMedia;
  i: number;
  total: number;
  onChange: (next: Partial<AdminResourceMedia>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onFiles: (files: File[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  // Read once, at mount: re-running this as the URL arrives would fold the row
  // being typed into.
  const filled = useRef(m.url.trim() !== "");

  useEffect(() => {
    if (filled.current && window.matchMedia("(max-width: 700px)").matches) setOpen(false);
  }, []);

  const kindMeta = MEDIA_KINDS.find((k) => k.value === m.kind) ?? MEDIA_KINDS[0];

  return (
    <div className="admin-subcard admin-media-row" data-open={open}>
      <div className="admin-media-row__head">
        <button
          type="button"
          className="admin-media-row__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          <ChevronDown size={13} className="admin-fold__chev" />
          <span className="admin-label" style={{ margin: 0, flexShrink: 0 }}>
            {i + 1}. {kindMeta.label}
          </span>
          {!open && <span className="admin-media-row__sum">{rowSummary(m)}</span>}
        </button>
        <span className="admin-inline" style={{ gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="admin-btn admin-btn--quiet admin-btn--icon"
            aria-label={`Move attachment ${i + 1} up`}
            disabled={i === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--quiet admin-btn--icon"
            aria-label={`Move attachment ${i + 1} down`}
            disabled={i === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--quiet admin-btn--icon"
            aria-label={`Remove attachment ${i + 1}`}
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      <div className="admin-form-grid" id={bodyId} hidden={!open} style={{ marginTop: 10, marginBottom: 0 }}>
        <label className="admin-field">
          <span className="admin-label">Kind</span>
          <select
            className="admin-select admin-input--full"
            value={m.kind}
            onChange={(e) => onChange({ kind: e.target.value as ResourceMediaKind })}
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
            onChange={(e) => onChange({ fileSizeMb: e.target.value ? Number(e.target.value) : null })}
            placeholder="optional"
          />
        </label>
        {kindMeta.upload ? (
          <UploadField
            label="File or URL"
            kind={kindMeta.upload}
            value={m.url}
            onChange={(url) => onChange({ url })}
            onMoreFiles={onFiles}
            placeholder="https://… or upload"
            preview={m.kind === "image" ? { width: 132, height: 74 } : undefined}
          />
        ) : (
          <label className="admin-field admin-field--wide">
            <span className="admin-label">URL</span>
            <input
              className="admin-input admin-input--full"
              value={m.url}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://t.me/channel/123"
            />
          </label>
        )}
        <label className="admin-field">
          <span className="admin-label">Display name</span>
          <input
            className="admin-input admin-input--full"
            value={m.fileName}
            onChange={(e) => onChange({ fileName: e.target.value })}
            placeholder="Taken from the URL if blank"
          />
        </label>
        <label className="admin-field">
          <span className="admin-label">Caption</span>
          <input
            className="admin-input admin-input--full"
            value={m.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="Shown under the image or beside the download"
          />
        </label>
      </div>
    </div>
  );
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

  // Fold summaries, so a section closed on a phone still admits what is missing
  // from it.
  const attributionHint = `${
    [categoryName, lecturerName, organizationName, tags.length].filter(Boolean).length
  } of 4 set`;
  const publishingHint = [
    `${readMinutes || estimate} min`,
    isPremium ? "Premium" : null,
    isFeatured ? "Featured" : null,
  ]
    .filter(Boolean)
    .join(" · ");

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

  const filesRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<{ at: number; total: number; percent: number; name: string } | null>(null);
  const [queueError, setQueueError] = useState("");

  /**
   * Attach a whole selection at once — the reason this exists is that a post
   * usually arrives as several images plus a PDF, and adding a row, choosing a
   * kind and picking a file eleven times over is not authoring.
   *
   * One at a time on purpose: each upload signs its own request and then streams
   * the bytes, so a parallel burst would queue behind the API anyway and turn
   * the progress number into noise. A file that fails is reported by name and
   * the rest of the selection still goes up.
   */
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setQueueError("");
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const kind = detectKind(file);
      setQueue({ at: i + 1, total: files.length, percent: 0, name: file.name });
      try {
        const up = await uploadFile(file, uploadBucket(kind), (percent) =>
          setQueue((q) => (q ? { ...q, percent } : q)),
        );
        setMedia((prev) => [
          ...prev,
          { kind, url: up.url, fileName: file.name, fileSizeMb: asMb(up.bytes), caption: "" },
        ]);
      } catch (e) {
        failed.push(`${file.name} (${e instanceof Error ? e.message : "upload failed"})`);
      }
    }
    setQueue(null);
    if (failed.length) setQueueError(`Could not upload ${failed.join(", ")}`);
    if (filesRef.current) filesRef.current.value = "";
  };

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
    <>
      <div className="admin-form-split">
        <div className="admin-form-split__main">
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
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
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
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-panel__head">
              <h3>Body</h3>
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
                {bodyMd.trim() ? (
                  <Markdown text={bodyMd} />
                ) : (
                  <span className="admin-dim">Nothing to preview yet.</span>
                )}
              </div>
            )}
            <span className="admin-field__hint">
              {bodyMd.length.toLocaleString("en-US")} characters · reads in about {estimate} min. Markdown renders
              in full for readers — headings, bold, lists, code, links, images and tables.
            </span>
          </div>

          <div className="admin-card">
            <div className="admin-panel__head">
              <h3>
                <Paperclip size={13} />
                Attachments
                {media.length > 0 && <span className="admin-dim">· {media.length}</span>}
              </h3>
              <span className="admin-inline" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  onClick={() => filesRef.current?.click()}
                  disabled={!!queue}
                >
                  <Upload size={12} />
                  {queue ? `${queue.at} of ${queue.total} · ${queue.percent}%` : "Upload files"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() => setMedia((p) => [...p, emptyMedia()])}
                >
                  <Plus size={12} /> Add row
                </button>
              </span>
            </div>
            <p className="page-desc" style={{ marginTop: 2 }}>
              Whatever the original post carried, in the order it should appear. Images and video play inline on
              the site, PDFs open in a reader, and everything else becomes a download row — the kind is what
              decides. Pick as many files as you like at once; each one becomes its own row with the kind and size
              filled in.
            </p>

            <input
              ref={filesRef}
              type="file"
              multiple
              className="admin-sr"
              tabIndex={-1}
              onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
            />

            {queue && (
              <>
                <span className="admin-uploadbar" role="progressbar" aria-valuenow={queue.percent}>
                  <i style={{ width: `${queue.percent}%` }} />
                </span>
                <span className="admin-field__hint">
                  Uploading {queue.name} — file {queue.at} of {queue.total}. Leaving the page cancels the rest.
                </span>
              </>
            )}
            {queueError && (
              <div className="admin-alert admin-alert--warn" role="alert">
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{queueError}</span>
              </div>
            )}

            {media.length === 0 && !queue && (
              <AdminEmpty
                icon={<Paperclip size={18} />}
                title="No attachments"
                hint="A text-only resource is fine — the body alone renders."
                action={{ label: "Upload files", onClick: () => filesRef.current?.click() }}
              />
            )}

            <div className="admin-stack" style={{ gap: 10 }}>
              {media.map((m, i) => (
                <MediaRow
                  key={i}
                  m={m}
                  i={i}
                  total={media.length}
                  onChange={(next) => setRow(i, next)}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => setMedia((p) => p.filter((_, j) => j !== i))}
                  onFiles={addFiles}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="admin-form-split__aside">
          <AdminFold title="Cover image" hint={coverUrl.trim() ? "Set" : "Not set"} collapseOnPhone>
            <UploadField
              label="Cover image"
              kind="image"
              value={coverUrl}
              onChange={setCoverUrl}
              placeholder="https://… or upload"
              preview={{ width: 132, height: 74 }}
              hint="Optional. Without one the card falls back to the category icon."
            />
          </AdminFold>

          <AdminFold title="Attribution" hint={attributionHint} collapseOnPhone>
            <p className="page-desc" style={{ marginTop: -4 }}>
              The same rows the courses use, so a cheat-sheet lands in the category people already browse. A name
              that matches nothing is created on save — pick from the list where you can.
            </p>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
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
          </AdminFold>

          <AdminFold title="Publishing" hint={publishingHint} collapseOnPhone>
            <div className="admin-form-grid" style={{ marginBottom: 0 }}>
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
              <div className="admin-field admin-field--wide">
                <span className="admin-label">Visibility</span>
                <div className="admin-stack" style={{ gap: 9 }}>
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
          {saving ? "Saving…" : initial ? "Save changes" : "Create resource"}
        </button>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => router.push("/admin/resources")}>
          Cancel
        </button>
      </div>
    </>
  );
}
