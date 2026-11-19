"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  GraduationCap,
  Hash,
  Layers,
  ListChecks,
  RotateCcw,
  Search,
  Tag,
  Target,
  X,
} from "lucide-react";
import { get, post } from "@/lib/api";
import type {
  AdminBatchCourse,
  AdminBatchField,
  AdminBatchMode,
  AdminBatchOptions,
  AdminBatchResult,
} from "@/lib/types";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import { plural } from "@/lib/format";

/**
 * Batch editing exists so a catalogue that is mostly "same lecturer, same
 * publisher, same level" does not have to be corrected one course at a time.
 * The order follows how an operator thinks about the job: pick the fact, pick
 * the courses, type the value, apply once. Everything the last apply changed is
 * held in a snapshot, so one Undo puts every row back.
 */

interface FieldSpec {
  id: AdminBatchField;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** Scalar fields replace; list fields add by default. */
  defaultMode: AdminBatchMode;
  modes: Array<{ id: AdminBatchMode; label: string }>;
  /** A list field accepts one value per line. */
  multiline?: boolean;
  placeholder: string;
}

const FIELDS: FieldSpec[] = [
  {
    id: "lecturer",
    label: "Lecturer / instructor",
    hint: "Credit the same teacher on many courses at once. A name that does not exist yet is created.",
    icon: <GraduationCap size={17} />,
    defaultMode: "add",
    modes: [
      { id: "add", label: "Add credit" },
      { id: "replace", label: "Replace credits" },
      { id: "remove", label: "Remove credit" },
    ],
    placeholder: "e.g. Mosh Hamedani",
  },
  {
    id: "organization",
    label: "Organisation / publisher",
    hint: "Set the publisher — Udemy, Coursera, a university or your own label.",
    icon: <Building2 size={17} />,
    defaultMode: "replace",
    modes: [
      { id: "replace", label: "Set publisher" },
      { id: "remove", label: "Clear publisher" },
    ],
    placeholder: "e.g. Udemy",
  },
  {
    id: "category",
    label: "Category",
    hint: "File every selected course under one subject. The category is created if it is new.",
    icon: <Tag size={17} />,
    defaultMode: "add",
    modes: [
      { id: "add", label: "Add category" },
      { id: "replace", label: "Replace categories" },
      { id: "remove", label: "Remove category" },
    ],
    placeholder: "e.g. Programming",
  },
  {
    id: "level",
    label: "Level",
    hint: "Beginner, Intermediate, Advanced or All Levels — applied to the whole selection.",
    icon: <BarChart3 size={17} />,
    defaultMode: "replace",
    modes: [
      { id: "replace", label: "Set level" },
      { id: "remove", label: "Clear level" },
    ],
    placeholder: "e.g. Intermediate",
  },
  {
    id: "prerequisites",
    label: "Prerequisites",
    hint: "Append a requirement to what is already written, or replace the whole note.",
    icon: <ListChecks size={17} />,
    defaultMode: "add",
    modes: [
      { id: "add", label: "Append" },
      { id: "replace", label: "Replace" },
      { id: "remove", label: "Clear" },
    ],
    multiline: true,
    placeholder: "e.g. Comfortable with Python basics",
  },
  {
    id: "audience",
    label: "Target audience",
    hint: "Who the course is for. One audience per apply, or one per line.",
    icon: <Target size={17} />,
    defaultMode: "add",
    modes: [
      { id: "add", label: "Add" },
      { id: "replace", label: "Replace" },
      { id: "remove", label: "Clear" },
    ],
    multiline: true,
    placeholder: "e.g. Developers\nData analysts",
  },
  {
    id: "tags",
    label: "Tags",
    hint: "Search tags shown on the course page. One tag per line is fine.",
    icon: <Hash size={17} />,
    defaultMode: "add",
    modes: [
      { id: "add", label: "Add tags" },
      { id: "replace", label: "Replace tags" },
      { id: "remove", label: "Clear tags" },
    ],
    multiline: true,
    placeholder: "e.g. python\nmachine-learning",
  },
];

function currentValues(course: AdminBatchCourse, field: AdminBatchField): string[] {
  if (field === "lecturer") return course.lecturers;
  if (field === "organization") return course.organization ? [course.organization] : [];
  if (field === "category") return course.categories;
  if (field === "level") return course.level ? [course.level] : [];
  if (field === "prerequisites") return course.prerequisites ? [course.prerequisites] : [];
  if (field === "audience") return course.audience;
  return course.tags;
}

function suggestions(options: AdminBatchOptions | null, field: AdminBatchField): string[] {
  if (!options) return [];
  if (field === "lecturer") return options.lecturers.map((x) => x.name);
  if (field === "organization") return options.organizations.map((x) => x.name);
  if (field === "category") return options.categories.map((x) => x.name);
  if (field === "level") return options.levels.map((x) => x.name);
  if (field === "audience") return options.audience;
  if (field === "tags") return options.tags;
  return [];
}

export default function AdminBatchPage() {
  const toast = useAdminToast();
  const [options, setOptions] = useState<AdminBatchOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [field, setField] = useState<AdminBatchField | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<AdminBatchMode>("add");
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AdminBatchResult | null>(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    get<AdminBatchOptions>("/admin/batch/options")
      .then(setOptions)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spec = FIELDS.find((f) => f.id === field) ?? null;
  const courses = options?.courses ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((c) => {
      if (q && !`${c.title} ${c.lecturers.join(" ")} ${c.organization ?? ""} ${c.categories.join(" ")}`.toLowerCase().includes(q))
        return false;
      if (onlyMissing && field && currentValues(c, field).length > 0) return false;
      return true;
    });
  }, [courses, query, onlyMissing, field]);

  const selectedCourses = useMemo(
    () => courses.filter((c) => selected.has(c.id)),
    [courses, selected],
  );

  const visibleAllSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someVisibleSelected = filtered.some((c) => selected.has(c.id));

  const chooseField = (id: AdminBatchField) => {
    const next = FIELDS.find((f) => f.id === id)!;
    setField(id);
    setMode(next.defaultMode);
    setValue("");
    setStep(2);
    setOnlyMissing(false);
    setQuery("");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (visibleAllSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const reset = () => {
    setField(null);
    setStep(1);
    setSelected(new Set());
    setValue("");
    setQuery("");
    setOnlyMissing(false);
    setResult(null);
  };

  const apply = async () => {
    if (!field || !value.trim()) return;
    setApplying(true);
    try {
      const res = await post<AdminBatchResult>("/admin/batch/apply", {
        field,
        mode,
        value: value.trim(),
        courseIds: [...selected],
      });
      setResult(res);
      toast.success(`Applied to ${plural(res.applied, "course")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply that batch");
    } finally {
      setApplying(false);
    }
  };

  const undo = async () => {
    if (!result) return;
    setUndoing(true);
    try {
      const res = await post<{ reverted: number }>("/admin/batch/revert", { snapshot: result.snapshot });
      toast.success(`Restored ${plural(res.reverted, "course")}`);
      setResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo that batch");
    } finally {
      setUndoing(false);
    }
  };

  // The values that "Add" would actually change; the rest already carry it.
  const alreadyHave = useMemo(() => {
    if (!field || (mode !== "add" && mode !== "replace")) return 0;
    const wanted = value
      .split(/\r?\n|,/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (wanted.length === 0) return 0;
    return selectedCourses.filter((c) => {
      const have = currentValues(c, field).map((v) => v.toLowerCase());
      return wanted.every((w) => have.includes(w));
    }).length;
  }, [field, mode, value, selectedCourses]);

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Batch edit</h1>
          <p className="page-desc">
            Apply one fact — a lecturer, publisher, category, level, prerequisite, audience or tag — to many courses.
            Nothing is saved until you press Apply, and one Undo reverses the whole batch.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <Link href="/admin/courses" className="admin-btn admin-btn--ghost">
            <ArrowLeft size={13} /> Back to courses
          </Link>
        </div>
      </div>

      <div className="admin-steps" aria-label="Batch steps">
        {[
          [1, "What to change"],
          [2, "Which courses"],
          [3, "The value"],
        ].map(([n, label]) => (
          <span
            key={n}
            className={`admin-step ${step === n ? "admin-step--on" : ""} ${step > Number(n) ? "admin-step--done" : ""}`}
          >
            <span className="admin-step__n">{step > Number(n) ? <Check size={11} /> : n}</span>
            {label}
          </span>
        ))}
      </div>

      {loading && <div className="admin-skeleton" style={{ display: "block", height: 120 }} />}

      {!loading && result && (
        <div className="admin-card">
          <h3>
            <Check size={14} /> Batch applied
          </h3>
          <p className="page-desc" style={{ marginTop: -4 }}>
            <strong>{FIELDS.find((f) => f.id === result.field)?.label}</strong> was set to{" "}
            <strong>{result.value}</strong> on {plural(result.applied, "course")}. If that was not what you meant, undo
            it now — the previous values were captured for exactly these rows.
          </p>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={undo} disabled={undoing}>
              <RotateCcw size={13} /> {undoing ? "Undoing…" : "Undo this batch"}
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={reset}>
              Start another batch
            </button>
          </div>
        </div>
      )}

      {!loading && !result && step === 1 && (
        <div className="admin-card">
          <h3>What do you want to change?</h3>
          <p className="page-desc" style={{ marginTop: -4 }}>
            Pick the fact to apply. You will choose the courses next, then the value — so nothing is touched while you
            are still deciding.
          </p>
          <div className="admin-grid-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {FIELDS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="admin-choice"
                onClick={() => chooseField(f.id)}
              >
                <span className="admin-choice__icon">{f.icon}</span>
                <span className="admin-choice__body">
                  <strong>{f.label}</strong>
                  <span>{f.hint}</span>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !result && step === 2 && spec && (
        <div className="admin-card admin-card--flush">
          <div className="admin-card__head">
            <h3>
              <Layers size={14} /> {spec.label}: choose the courses
            </h3>
            <span className="admin-toolbar__count">
              {selected.size} selected · {courses.length} in catalogue
            </span>
          </div>
          <div className="admin-toolbar" style={{ padding: "0 14px 12px" }}>
            <span className="admin-search">
              <Search size={14} />
              <input
                className="admin-input"
                placeholder="Title, lecturer or publisher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search courses"
              />
            </span>
            <label className="admin-inline" style={{ gap: 6, fontSize: 11.5 }}>
              <input
                type="checkbox"
                className="admin-check"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
              />
              Only courses with no {spec.label.toLowerCase().split(" / ")[0]}
            </label>
            <span className="admin-toolbar__count">
              {filtered.length === courses.length ? `${courses.length} total` : `${filtered.length} of ${courses.length}`}
            </span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    className="admin-check"
                    checked={visibleAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !visibleAllSelected && someVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible courses"
                  />
                </th>
                <th>Course</th>
                <th>{spec.label}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <AdminEmpty
                      icon={<Search size={18} />}
                      title="Nothing matches"
                      hint="Try a different search, or include courses that already have a value."
                      action={{
                        label: "Clear filters",
                        onClick: () => {
                          setQuery("");
                          setOnlyMissing(false);
                        },
                      }}
                    />
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const have = currentValues(c, field!);
                return (
                  <tr key={c.id} className={selected.has(c.id) ? "admin-row--on" : undefined}>
                    <td data-role="media">
                      <input
                        type="checkbox"
                        className="admin-check"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        aria-label={`Select ${c.title}`}
                      />
                    </td>
                    <td data-role="head">
                      <button type="button" className="admin-cell-link admin-cell-link--button" onClick={() => toggle(c.id)}>
                        <span className="admin-cell-title">{c.title}</span>
                        <span className="admin-cell-sub" style={{ display: "block" }}>
                          {c.lecturers.join(", ") || "No lecturer"} · {c.organization ?? "No publisher"}
                        </span>
                      </button>
                    </td>
                    <td data-role="wide" className="admin-table__quiet">
                      {have.length ? have.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="admin-form-actions" style={{ padding: 14 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={13} /> Back
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={selected.size === 0}
              onClick={() => setStep(3)}
            >
              Continue with {selected.size || "no"} {selected.size === 1 ? "course" : "courses"} <ArrowRight size={13} />
            </button>
            <button type="button" className="admin-btn admin-btn--quiet" onClick={reset}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {!loading && !result && step === 3 && spec && (
        <div className="admin-card">
          <h3>
            {spec.icon} {spec.label}
          </h3>
          <p className="page-desc" style={{ marginTop: -4 }}>
            {spec.hint}
          </p>

          <div className="admin-form-grid">
            <div className="admin-field">
              <label className="admin-label" htmlFor="batch-mode">
                What to do
              </label>
              <select
                id="batch-mode"
                className="admin-select"
                value={mode}
                onChange={(e) => setMode(e.target.value as AdminBatchMode)}
              >
                {spec.modes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field admin-field--wide">
              <label className="admin-label" htmlFor="batch-value">
                {spec.label}
              </label>
              {spec.multiline ? (
                <textarea
                  id="batch-value"
                  className="admin-textarea"
                  rows={3}
                  placeholder={spec.placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={mode === "remove"}
                />
              ) : (
                <input
                  id="batch-value"
                  className="admin-input"
                  placeholder={spec.placeholder}
                  value={value}
                  list={`batch-values-${spec.id}`}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={mode === "remove"}
                />
              )}
              {spec.multiline && <span className="admin-field__hint">One value per line.</span>}
              {!spec.multiline && (
                <datalist id={`batch-values-${spec.id}`}>
                  {suggestions(options, spec.id).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          <div className="admin-card" style={{ background: "var(--adm-raised)", marginBottom: 14 }}>
            <strong style={{ fontSize: 12.5 }}>
              {mode === "remove"
                ? `Clear ${spec.label.toLowerCase()} on ${plural(selected.size, "course")}`
                : `${spec.modes.find((m) => m.id === mode)?.label}: ${value.trim() || "…"}`}
            </strong>
            <p className="page-desc" style={{ margin: "5px 0 0" }}>
              {selectedCourses
                .slice(0, 6)
                .map((c) => c.title)
                .join(" · ")}
              {selected.size > 6 ? ` · and ${selected.size - 6} more` : ""}
            </p>
            {alreadyHave > 0 && mode === "add" && (
              <p className="page-desc" style={{ margin: "5px 0 0" }}>
                {alreadyHave === selected.size
                  ? "Every selected course already has this value — Apply would change nothing."
                  : `${alreadyHave} of ${selected.size} already have it and will be left as they are.`}
              </p>
            )}
          </div>

          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={13} /> Back
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={applying || (mode !== "remove" && !value.trim())}
              onClick={apply}
            >
              <Check size={13} />{" "}
              {applying ? "Applying…" : `Apply to ${selected.size} ${selected.size === 1 ? "course" : "courses"}`}
            </button>
            <button type="button" className="admin-btn admin-btn--quiet" onClick={reset}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
