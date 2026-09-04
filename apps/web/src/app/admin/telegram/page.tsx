"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Megaphone,
  RefreshCw,
  Send,
} from "lucide-react";
import { get, post } from "@/lib/api";
import type { AdminTelegramConsole } from "@/lib/types";
import { relativeTime } from "@/lib/metrics";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import AdminFold from "@/components/admin/AdminFold";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { plural } from "@/lib/format";

/**
 * Telegram bot console — health, account pairing, and the commands that make
 * sense from a browser.
 *
 * The pairing block is the important half. `User.telegramId` is the only join
 * between a Syncourse login and a Telegram account, and without it three things
 * silently do nothing: `/broadcast` has no recipients, a staff account gets no
 * admin rights in the bot unless its numeric id is in TELEGRAM_ADMIN_IDS, and
 * the web cannot attach channel files at all (the bot needs an operator's chat
 * to forward messages through in order to read them).
 *
 * The connect link is signed and short-lived rather than stored, so it is safe
 * to regenerate on every page load and there is no code to type.
 */
export default function AdminTelegramPage() {
  const toast = useAdminToast();
  const [data, setData] = useState<AdminTelegramConsole | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    // Clearing first matters for the retry button: the error branch renders on a
    // truthy `error`, so a successful reload that left it set would still show
    // the failure it just recovered from.
    setError("");
    get<AdminTelegramConsole>("/admin/telegram")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not reach the bot"));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <div>
        <div className="admin-page-head">
          <h1>Telegram bot</h1>
        </div>
        <div className="admin-card">
          <AdminEmpty
            icon={<AlertTriangle size={18} />}
            title="Could not reach the bot"
            hint={error}
            action={{ label: "Try again", onClick: load }}
          />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <div className="admin-page-head">
          <h1>Telegram bot</h1>
        </div>
        <span className="admin-skeleton" style={{ height: 180, display: "block" }} />
      </div>
    );
  }

  const health = !data.configured
    ? { cls: "admin-status--bad", label: "Not configured" }
    : data.online
      ? { cls: "admin-status--good", label: `Online as @${data.username ?? "bot"}` }
      : { cls: "admin-status--bad", label: "Offline" };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Telegram bot</h1>
          <p className="page-desc">
            The bot delivers course archives that are too big to host here. This page is where you connect your own
            account to it and announce things.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="admin-minitiles" style={{ marginBottom: 14 }}>
        <div className="admin-minitile">
          <strong>{data.linkedFiles.toLocaleString("en-US")}</strong>
          <span>Files attached</span>
        </div>
        <div className="admin-minitile">
          <strong>{data.pairedUsers.toLocaleString("en-US")}</strong>
          <span>Connected accounts</span>
        </div>
        <div className="admin-minitile">
          <strong>{data.downloads.toLocaleString("en-US")}</strong>
          <span>Bot downloads</span>
        </div>
      </div>

      <div className="admin-detail-grid">
        <div className="admin-stack">
          <div className="admin-card">
            <h3>Your account</h3>
            {data.paired ? (
              <>
                <p className="admin-status admin-status--good" style={{ marginBottom: 10 }}>
                  <CheckCircle2 size={13} /> Connected
                  {data.telegramUsername ? ` as @${data.telegramUsername}` : ""}
                </p>
                <p className="page-desc" style={{ margin: 0 }}>
                  Attaching and importing files works from any course page. Forward a ZIP to the bot and it shows up
                  there as a waiting file.
                </p>
                <div className="admin-inline" style={{ marginTop: 12 }}>
                  <a
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    href={data.pairingLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 size={12} /> Reconnect another Telegram account
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="admin-notice admin-notice--warn" role="status" style={{ marginBottom: 12 }}>
                  <AlertTriangle size={14} />
                  <span>
                    <strong>Not connected.</strong> Until you connect, the console cannot attach Telegram files and the
                    bot will not treat you as an admin unless your numeric id is in <code>TELEGRAM_ADMIN_IDS</code>.
                  </span>
                </div>
                <a
                  className="admin-btn admin-btn--primary"
                  href={data.pairingLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Send size={13} /> Connect Telegram
                </a>
                <p className="admin-field__hint" style={{ marginTop: 8 }}>
                  Opens the bot with a one-tap Start. The link is signed and expires in about 15 minutes — refresh
                  this page for a fresh one.
                </p>
              </>
            )}
          </div>

          <div className="admin-card">
            <h3>Announcement</h3>
            <p className="page-desc" style={{ marginTop: -4 }}>
              Sends one message to every connected account — {data.pairedUsers.toLocaleString("en-US")} right now.
              There is no undo and no per-user opt-out yet.
            </p>
            <textarea
              className="admin-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="New courses just landed…"
            />
            <div className="admin-form-actions" style={{ marginTop: 10 }}>
              <ConfirmButton
                label={`Send to ${plural(data.pairedUsers, "account")}`}
                question="Send this announcement?"
                confirmLabel="Send now"
                className="admin-btn admin-btn--primary"
                icon={false}
                busy={busy === "broadcast"}
                disabled={text.trim().length < 4 || data.pairedUsers === 0}
                onConfirm={async () => {
                  setBusy("broadcast");
                  try {
                    const r = await post<{ sent: number; total: number }>("/admin/telegram/broadcast", {
                      text: text.trim(),
                    });
                    toast.success(`Sent to ${r.sent} of ${r.total} accounts`);
                    setText("");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not send that");
                  } finally {
                    setBusy("");
                  }
                }}
              />
              <span className="admin-field__hint">
                <Megaphone size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                Blocked users are skipped silently.
              </span>
            </div>
          </div>

          <AdminFold
            title="Recent bot activity"
            hint={`Last ${data.recent.length}`}
            collapseOnPhone
            flush
          >
            {data.recent.length === 0 ? (
              <AdminEmpty
                icon={<Send size={18} />}
                title="Nothing yet"
                hint="Downloads, pairings and broadcasts show up here as the bot handles them."
              />
            ) : (
              <div>
                {data.recent.map((r, i) => (
                  <div key={`${r.at}-${i}`} className="admin-row">
                    <div className="admin-row__main">
                      <div className="admin-row__title">{r.kind}</div>
                      <div className="admin-row__meta">{r.detail}</div>
                    </div>
                    <div className="admin-row__actions">
                      <span className="admin-table__quiet">{relativeTime(r.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminFold>
        </div>

        <div className="admin-stack">
          <div className="admin-card">
            <h3>Bot</h3>
            <p className={`admin-status ${health.cls}`} style={{ marginBottom: 10 }}>
              {health.label}
            </p>
            <dl className="admin-kv">
              <dt>Username</dt>
              <dd>{data.username ? `@${data.username}` : "—"}</dd>
              <dt>Courses live</dt>
              <dd>{data.courses.toLocaleString("en-US")}</dd>
              <dt>Files attached</dt>
              <dd>{data.linkedFiles.toLocaleString("en-US")}</dd>
              {data.error && (
                <>
                  <dt>Last error</dt>
                  <dd style={{ color: "var(--adm-bad)" }}>{data.error}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="admin-card">
            <h3>How file linking works</h3>
            <ol className="page-desc" style={{ paddingLeft: 18, display: "grid", gap: 6, margin: 0 }}>
              <li>Add the bot to the channel holding the archives — as an admin, if it is a channel.</li>
              <li>Open the course in the console and paste the message link, or forward the file to the bot.</li>
              <li>
                For a whole course posted as parts, use Import with the first and last message ids. Module names and
                part numbers are read from the filenames.
              </li>
              <li>Students tap download on the course page and the bot sends the parts in order.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
