"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FolderDown, Link2, RefreshCw, Send } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { plural } from "@/lib/format";
import type {
  AdminTelegramConsole,
  AdminTelegramImportResult,
  AdminTelegramModule,
} from "@/lib/types";
import { useAdminToast } from "./AdminToast";
import ConfirmButton from "./ConfirmButton";

/**
 * Telegram files for one course — the web face of `/link`, `/import`
 * and `/unlink`.
 *
 * Course archives are hundreds of megabytes and stay on Telegram; what lives
 * here is the mapping from a course to the messages that hold its files, which
 * is what the bot reads when a student taps download.
 *
 * Everything here needs a paired Telegram account, and not for permissions
 * reasons: the Bot API cannot read a message by id, so the only way to inspect
 * one is to forward it into a chat the bot can post in, read the file off the
 * copy and delete it again. That scratch chat is the operator's own DM with the
 * bot — hence "Connect Telegram" before anything else works.
 */
/** The trailing number of a t.me message link, so "Copy Link" can be pasted straight in. */
const messageIdOf = (raw: string): string => {
  const nums = raw.trim().split(/[^0-9]+/).filter(Boolean);
  return nums.length ? nums[nums.length - 1] : "";
};

export default function CourseFilesPanel({ slug }: { slug: string }) {
  const toast = useAdminToast();
  const [modules, setModules] = useState<AdminTelegramModule[] | null>(null);
  const [bot, setConsole] = useState<AdminTelegramConsole | null>(null);
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");
  const [link, setLink] = useState("");
  const [channel, setChannel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    get<{ modules: AdminTelegramModule[] }>(`/admin/courses/${slug}/telegram`)
      .then((d) => {
        setModules(d.modules);
        setLoadError("");
      })
      .catch((e) => {
        // Swallowing this printed "Nothing attached" for a request that never
        // arrived — indistinguishable from a course with no files.
        setModules([]);
        setLoadError(e instanceof Error ? e.message : "Could not read the attached files");
      });
  }, [slug]);

  useEffect(() => {
    load();
    get<AdminTelegramConsole>("/admin/telegram").then(setConsole).catch(() => setConsole(null));
  }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await fn());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy("");
    }
  };

  const fileCount = (modules ?? []).reduce((a, m) => a + m.files.length, 0);
  const totalMb = (modules ?? []).reduce((a, m) => a + m.sizeMb, 0);
  const forwarded = bot?.forwarded;

  return (
    <div className="admin-card admin-card--flush">
      <div className="admin-card__head">
        <h3>Telegram files</h3>
        <span className="admin-section-head__hint">
          {modules === null
            ? "Loading…"
            : loadError
              ? "Could not load"
              : fileCount === 0
                ? "Nothing attached"
                : `${plural(fileCount, "file")} · ${totalMb.toFixed(1)} MB`}
        </span>
      </div>

      {loadError && (
        <div style={{ padding: "12px 14px 0" }}>
          <div className="admin-alert admin-alert--warn" role="status">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {loadError} — this course may still have files attached.{" "}
              <button type="button" className="admin-btn admin-btn--quiet admin-btn--sm" onClick={load}>
                Try again
              </button>
            </span>
          </div>
        </div>
      )}

      {bot && !bot.paired && (
        <div style={{ padding: "12px 14px 0" }}>
          <div className="admin-alert admin-alert--warn" role="status">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Connect your Telegram account before attaching files — the bot needs your chat to read messages
              through. <Link href="/admin/telegram">Open the Telegram page →</Link>
            </span>
          </div>
        </div>
      )}

      {modules !== null && fileCount === 0 && !loadError && (
        <p className="admin-empty">
          No files attached. Students will see this course but have nothing to download.
        </p>
      )}

      {(modules ?? []).map((m, i) => (
        <div key={m.title ?? `ungrouped-${i}`}>
          <div className="admin-module-head">
            {m.title ?? "Ungrouped"}
            <span>
              {plural(m.files.length, "part")} · {m.sizeMb.toFixed(1)} MB
            </span>
          </div>
          {m.files.map((f) => (
            <div key={f.id} className="admin-file">
              <span className="admin-file__part">{f.partIndex}</span>
              <span className="admin-file__name">{f.fileName ?? "unnamed file"}</span>
              <span className="admin-file__size">{f.fileSizeMb ? `${f.fileSizeMb.toFixed(1)} MB` : "—"}</span>
              {f.chatUsername && (
                <a
                  className="admin-btn admin-btn--quiet admin-btn--sm"
                  href={`https://t.me/${f.chatUsername}/${f.messageId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open the source message"
                >
                  <Link2 size={12} />
                </a>
              )}
              <ConfirmButton
                label=""
                ariaLabel={`Detach ${f.fileName ?? "file"}`}
                question="Detach?"
                confirmLabel="Detach"
                className="admin-btn admin-btn--quiet admin-btn--icon"
                busy={busy === f.id}
                onConfirm={() =>
                  run(f.id, async () => {
                    await del(`/admin/courses/${slug}/telegram/${f.id}`);
                    return `Detached ${f.fileName ?? "the file"}`;
                  })
                }
              />
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: 14, borderTop: "1px solid var(--adm-line)" }}>
        <div className="admin-stack" style={{ gap: 12 }}>
          <div className="admin-field">
            <span className="admin-label">Attach one file by message link</span>
            <div className="admin-inline" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input
                className="admin-input admin-input--full"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://t.me/channel/1234"
              />
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                style={{ flexShrink: 0 }}
                disabled={busy !== "" || !link.trim()}
                onClick={() =>
                  run("link", async () => {
                    const r = await post<{ created: boolean; fileName: string | null }>(
                      `/admin/courses/${slug}/telegram/link`,
                      { url: link.trim() },
                    );
                    setLink("");
                    return r.created ? `Attached ${r.fileName ?? "the file"}` : "That file was already attached";
                  })
                }
              >
                {busy === "link" ? "…" : <Link2 size={12} />}
                Attach
              </button>
            </div>
            <span className="admin-field__hint">
              In Telegram: long-press the file → Copy Link. The bot must be in that chat, and an admin of it if it
              is a channel.
            </span>
          </div>

          <div className="admin-field">
            <span className="admin-label">Attach a file you forwarded to the bot</span>
            <div className="admin-inline">
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={busy !== "" || !bot?.paired}
                onClick={() =>
                  run("forwarded", async () => {
                    const r = await post<{ created: boolean; fileName: string | null }>(
                      `/admin/courses/${slug}/telegram/forwarded`,
                      {},
                    );
                    setConsole((c) => (c ? { ...c, forwarded: null } : c));
                    return r.created ? `Attached ${r.fileName ?? "the file"}` : "That file was already attached";
                  })
                }
              >
                {busy === "forwarded" ? "…" : <FolderDown size={12} />}
                Attach forwarded file
              </button>
              <span className="admin-field__hint">
                {forwarded
                  ? `Waiting: ${forwarded.fileName ?? "unnamed"}${
                      forwarded.fileSizeMb ? ` · ${forwarded.fileSizeMb.toFixed(1)} MB` : ""
                    }`
                  : "Nothing waiting — send or forward the file to the bot in Telegram first."}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--quiet admin-btn--icon"
                title="Check again"
                aria-label="Check for a forwarded file again"
                onClick={() => get<AdminTelegramConsole>("/admin/telegram").then(setConsole).catch(() => {})}
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          <div className="admin-field">
            <span className="admin-label">Import a range of messages</span>
            <div className="admin-inline" style={{ gap: 8 }}>
              <input
                className="admin-input"
                style={{ minWidth: 150, flex: 1 }}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="@channel or t.me link"
              />
              <input
                className="admin-input"
                style={{ minWidth: 78, width: 78 }}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onBlur={(e) => setFrom(messageIdOf(e.target.value))}
                placeholder="from"
              />
              <input
                className="admin-input"
                style={{ minWidth: 78, width: 78 }}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onBlur={(e) => setTo(messageIdOf(e.target.value))}
                placeholder="to"
              />
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={busy !== "" || !channel.trim() || !messageIdOf(from) || !messageIdOf(to)}
                onClick={() =>
                  run("import", async () => {
                    const r = await post<AdminTelegramImportResult>(
                      `/admin/courses/${slug}/telegram/import`,
                      { channel: channel.trim(), from: Number(messageIdOf(from)), to: Number(messageIdOf(to)) },
                    );
                    return `${r.created} attached, ${r.updated} updated, ${r.skipped} skipped · ${r.totalMb.toFixed(
                      1,
                    )} MB across ${plural(r.modules.length, "module")}`;
                  })
                }
              >
                {busy === "import" ? "Importing…" : <Download size={12} />}
                {busy === "import" ? "" : "Import"}
              </button>
            </div>
            <span className="admin-field__hint">
              Paste the channel&apos;s @username, or a link to any message in it. For the bounds, long-press the first
              and last file → Copy Link and paste those here — the message id is picked out for you. The bot must be
              in that chat, an admin if it is a channel. Reads about one message a second, so keep a range under 60
              or the request times out; part numbers and module names come from the filenames.
            </span>
          </div>

          <div className="admin-inline" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              disabled={busy !== "" || fileCount === 0 || !bot?.paired}
              onClick={() =>
                run("test", async () => {
                  await post(`/admin/courses/${slug}/telegram/test`, {});
                  return "Sent to your Telegram — check the chat with the bot";
                })
              }
            >
              <Send size={12} /> Test delivery
            </button>
            {fileCount > 0 && (
              <ConfirmButton
                label="Detach all"
                question={`Detach all ${fileCount} files?`}
                confirmLabel="Yes, detach all"
                className="admin-btn admin-btn--danger admin-btn--sm"
                icon={false}
                busy={busy === "all"}
                onConfirm={() =>
                  run("all", async () => {
                    const r = await del<{ removed: number }>(`/admin/courses/${slug}/telegram`);
                    return `Detached ${plural(r.removed, "file")}`;
                  })
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
