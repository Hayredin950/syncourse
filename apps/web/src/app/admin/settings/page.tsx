"use client";

import { useState } from "react";
import { useToast } from "@/lib/useToast";

/** Site-wide configuration. Values are read from the backend env at runtime —
 *  the Telebirr number, crypto wallets and prices live in the API service. */
export default function AdminSettings() {
  const [telegramBot, setTelegramBot] = useState("@syncourse_bot");
  const [telebirrNumber, setTelebirrNumber] = useState("09 11 22 33 44");
  const [supportEmail, setSupportEmail] = useState("support@syncourse.app");
  const [saved, setSaved] = useState(false);
  const { toast, setToast } = useToast();

  const save = () => {
    setSaved(true);
    setToast("Settings saved (demo — wire to a config store for persistence)");
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-desc">Site-wide configuration shown to users on the Premium page and support flows.</p>
        </div>
      </div>

      <div className="admin-card">
        <h3>Payments</h3>
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Telebirr account shown to users
            <input className="admin-input" style={{ width: "100%", marginTop: 4 }} value={telebirrNumber} onChange={(e) => setTelebirrNumber(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Crypto note (OxaPay checkout)
            <input className="admin-input" style={{ width: "100%", marginTop: 4 }} defaultValue="USDT, BTC, ETH and more — checkout on OxaPay's secure page" />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Support</h3>
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Support email
            <input className="admin-input" style={{ width: "100%", marginTop: 4 }} value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Telegram bot (downloads &amp; notifications)
            <input className="admin-input" style={{ width: "100%", marginTop: 4 }} value={telegramBot} onChange={(e) => setTelegramBot(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h3>Plans (displayed on the Premium page)</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Days</th>
              <th>Price</th>
              <th>Badge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1 Month</td>
              <td>30</td>
              <td>$1.99</td>
              <td>—</td>
            </tr>
            <tr>
              <td>3 Months</td>
              <td>90</td>
              <td>$3.99</td>
              <td>—</td>
            </tr>
            <tr>
              <td>6 Months</td>
              <td>180</td>
              <td>$5.99</td>
              <td>
                <span className="admin-badge admin-badge--accent">BEST VALUE</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button className="admin-btn admin-btn--primary" onClick={save}>
        {saved ? "Saved ✓" : "Save settings"}
      </button>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
