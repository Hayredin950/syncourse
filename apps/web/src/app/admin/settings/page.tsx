import { Info } from "lucide-react";

/**
 * Site-wide configuration.
 *
 * These values live in the API's environment (Telebirr number, crypto wallets,
 * support address, plan prices). This screen is deliberately read-only: the
 * previous version offered editable inputs whose Save button could not persist
 * anything, which is worse than showing the truth. When a config store exists,
 * this page can become its editor.
 */
const SETTINGS = {
  telegramBot: "@syncourse_bot",
  telebirrNumber: "09 11 22 33 44",
  cryptoNote: "USDT, BTC, ETH and more — checkout on OxaPay's secure page",
  supportEmail: "support@syncourse.app",
};

const PLANS = [
  { name: "1 Month", days: 30, price: "$1.99", badge: null },
  { name: "3 Months", days: 90, price: "$3.99", badge: null },
  { name: "6 Months", days: 182, price: "$5.99", badge: "Best value" },
];

function Value({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="admin-field">
      <span className="admin-label">{label}</span>
      <div className="admin-readonly" tabIndex={0} aria-label={label}>
        {value}
      </div>
      {hint && <span className="admin-field__hint">{hint}</span>}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-desc">
            Configuration shown to users on the Premium page and in support flows.
          </p>
        </div>
      </div>

      <div className="admin-notice" style={{ marginBottom: 14 }}>
        <Info size={14} />
        <span>
          <strong>Read-only.</strong> These values come from the API&rsquo;s environment variables, so changing them
          needs a deployment — not an edit here. This screen shows what is actually live.
        </span>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <h3>Payments</h3>
          <div className="admin-form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginBottom: 0 }}>
            <Value label="Telebirr account shown to users" value={SETTINGS.telebirrNumber} />
            <Value
              label="Crypto note"
              value={SETTINGS.cryptoNote}
              hint="Shown under the OxaPay checkout button."
            />
          </div>
        </div>

        <div className="admin-card">
          <h3>Support</h3>
          <div className="admin-form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginBottom: 0 }}>
            <Value label="Support email" value={SETTINGS.supportEmail} />
            <Value
              label="Telegram bot"
              value={SETTINGS.telegramBot}
              hint="Handles downloads and payment notifications."
            />
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
                <td className="admin-cell-title" data-role="head">
                  {p.name}
                </td>
                <td className="admin-table__num" data-label="Days">
                  {p.days}
                </td>
                <td className="admin-table__num" data-label="Price">
                  {p.price}
                </td>
                <td data-role="wide">{p.badge ? <span className="admin-badge admin-badge--violet">{p.badge}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
