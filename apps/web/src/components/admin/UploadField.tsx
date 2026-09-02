"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Upload, X } from "lucide-react";
import { ACCEPT, humanSize, uploadFile, type UploadKind } from "@/lib/upload";

/**
 * A URL field with a real file picker beside it.
 *
 * Authoring a course means both cases: sometimes the video already lives
 * somewhere and you paste a link, sometimes it is an mp4 on your laptop and
 * there is no link to paste. One field handles both — the picker just writes
 * the resulting URL into the same input, so nothing downstream has to care
 * where the file came from.
 */
export default function UploadField({
  label,
  kind,
  value,
  onChange,
  placeholder,
  hint,
  preview,
  aside,
  wide = true,
}: {
  label: string;
  kind: UploadKind;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  /** Show a thumbnail of the uploaded image, at this pixel size. */
  preview?: { width: number; height: number };
  /** Rendered to the right of the input — the lesson "Free preview" checkbox. */
  aside?: ReactNode;
  wide?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");

  const busy = percent !== null;

  const pick = async (file: File) => {
    setError("");
    setDone("");
    setPercent(0);
    try {
      const up = await uploadFile(file, kind, setPercent);
      onChange(up.url);
      setDone(`${file.name} · ${humanSize(up.bytes)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPercent(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={wide ? "admin-field admin-field--wide" : "admin-field"}>
      <label className="admin-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="admin-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
        <input
          id={inputId}
          className="admin-input admin-input--full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--sm"
          style={{ flexShrink: 0 }}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? `${percent}%` : <Upload size={12} />}
          {busy ? "" : "Upload"}
        </button>
        {value && !busy && (
          <button
            type="button"
            className="admin-btn admin-btn--quiet admin-btn--icon"
            title="Clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange("");
              setDone("");
            }}
          >
            <X size={13} />
          </button>
        )}
        {aside}
      </div>

      {busy && (
        <span className="admin-uploadbar" role="progressbar" aria-valuenow={percent ?? 0}>
          <i style={{ width: `${percent}%` }} />
        </span>
      )}

      {preview && value && !busy && (
        <span className="admin-preview" style={{ marginTop: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={`${label} preview`} style={{ width: preview.width, height: preview.height }} />
        </span>
      )}

      {error ? (
        <span className="admin-field__hint" style={{ color: "var(--adm-bad)" }}>
          {error}
        </span>
      ) : done ? (
        <span className="admin-field__hint" style={{ color: "var(--adm-good)" }}>
          Uploaded {done}
        </span>
      ) : hint ? (
        <span className="admin-field__hint">{hint}</span>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT[kind]}
        className="admin-sr"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
    </div>
  );
}
