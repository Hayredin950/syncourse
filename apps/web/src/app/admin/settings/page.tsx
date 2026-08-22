"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useAdminToast } from "@/components/admin/AdminToast";

/**
 * Site-wide configuration.
 *
 * Everything here is display-only for now: the real values live in the API's
 * environment (Telebirr number, crypto wallets, plan prices), so this screen
 * says so plainly instead of pretending Save writes anywhere.
 */
const PLANS = [
  { name: "1 Month", days: 30, price: "$1.99", badge: null },
  { name: "3 Months", days: 90, price: "$3.99", badge: null },
  { name: "6 Months", days: 180, price: "$5.99", badge: "Best value" },
];

export default function AdminSettings() {
  const toast = useAdminToast();
  const [telegramBot, setTelegramBot] = useState("@syncourse_bot");
  const [telebirrNumber, setTelebirrNumber] = useState("09 11 22 33 44");
  const [cryptoNote, setCryptoNote] = useState(
    "USDT, BTC, ETH and more — checkout on OxaPay's secure page",
  );
  const [supportEmail, setSupportEmail] = useState("support@syncourse.app");

  const save = () => {
    toast.info("Not saved — these values come from the API environment, not a config store");
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-desc">
            Configuration shown to users on the Premium page and in support flows.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={save}>
            Save settings
          </button>
        </div>
      </div>

      <div className="admin-alert admin-alert--bad" style={{ marginBottom: 14, borderColor: "var(--adm-line-strong)", background: "var(--adm-raised)", color: "var(--adm-ink-2)" }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          These fields are not persisted yet. The live values are read from the API&rsquo;s environment variables on
          Render — editing here changes what you see on this screen and nothing else.
        </span>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <h3>Payments</h3>
          <div className="admin-form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginBottom: 0 }}>
            <label className="admin-field">
              <span className="admin-label">Telebirr account shown to users</span>
              <input
                className="admin-input admin-input--full"
                value={telebirrNumber}
                onChange={(e) => setTelebirrNumber(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Crypto note</span>
              <input
                className="admin-input admin-input--full"
                value={cryptoNote}
                onChange={(e) => setCryptoNote(e.target.value)}
              />
              <span className="admin-field__hint">Shown under the OxaPay checkout button.</span>
            </label>
          </div>
        </div>

        <div className="admin-card">
          <h3>Support</h3>
          <div className="admin-form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginBottom: 0 }}>
            <label className="admin-field">
              <span className="admin-label">Support email</span>
              <input
                className="admin-input admin-input--full"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Telegram bot</span>
              <input
                className="admin-input admin-input--full"
                value={telegramBot}
                onChange={(e) => setTelegramBot(e.target.value)}
              />
              <span className="admin-field__hint">Handles downloads and payment notifications.</span>
            </label>
          </div>
        </div>
      </div>

      <div className="admin-card admin-card--flush" style={{ marginTop: 14 }}>
        <div className="admin-card__head">
          <h3>Plans on the Premium page</h3>
          <span className="admin-section-head__hint">Priced in the API</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th className="admin-table__num">Days</th>
              <th className="admin-table__num">Price</th>
              <th>Badge</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.name}>
                <td className="admin-cell-title">{p.name}</td>
                <td className="admin-table__num">{p.days}</td>
                <td className="admin-table__num">{p.price}</td>
                <td>{p.badge ? <span className="admin-badge admin-badge--accent">{p.badge}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
