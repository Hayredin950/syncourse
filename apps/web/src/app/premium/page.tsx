"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CreditCard, MessageCircle, ShieldCheck, Wallet, Zap } from "lucide-react";
import { get, post } from "@/lib/api";
import type { HomeData, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { CoverImage } from "@/components/CoverImage";
import { MobileHeader } from "@/components/Nav";
import { Sk } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";
import { Toast } from "@/components/Toast";

interface CheckoutResult {
  subscriptionId: string;
  status: string;
  steps?: {
    step1: { title: string; text: string; accountName: string; accountNumber: string };
    step2: { title: string; hint: string };
  };
  redirectUrl?: string;
  /** Tikur Pay session — the gateway's own id and hosted page. */
  paymentNumber?: string;
  checkoutUrl?: string;
  expiresAt?: string;
  amount?: number;
  methods?: Record<string, { accountNumber?: string; accountName?: string; phoneNumber?: string }>;
}

interface TikurConfig {
  enabled: boolean;
  businessName: string;
  timeoutMinutes: number;
  rails: Record<string, { accountNumber?: string; accountName?: string; phoneNumber?: string }>;
}

const METHODS: { value: string; label: string; sub: string; icon: React.ReactNode; recommended?: boolean }[] = [
  {
    value: "tikur",
    label: "Bank · Telebirr · M-Pesa",
    sub: "Ethiopia · verified automatically in seconds",
    icon: <ShieldCheck size={17} />,
    recommended: true,
  },
  { value: "telebirr", label: "Telebirr (manual)", sub: "Ethiopia · we check the reference", icon: <Wallet size={17} /> },
  { value: "crypto", label: "Crypto", sub: "USDT · BTC · ETH · SOL", icon: <Zap size={17} /> },
  { value: "stripe", label: "Card & PayPal", sub: "Worldwide · Visa / Mastercard", icon: <CreditCard size={17} /> },
];

type MethodValue = (typeof METHODS)[number]["value"];

export default function PremiumPage() {
  const router = useRouter();
  const { token, loading } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  /* `plans.length === 0` is the skeleton branch below, so a failed request left
     the purchase page shimmering with no prices and no way to retry. */
  const [plansFailed, setPlansFailed] = useState(false);
  const [method, setMethod] = useState<MethodValue>("telebirr");
  const [selected, setSelected] = useState("6m");
  const [home, setHome] = useState<HomeData | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  const { toast, setToast } = useToast();
  const [paid, setPaid] = useState(false);
  /** The gateway's feature flag — false until TIKURPAY_API_KEY is set on the API. */
  const [tikur, setTikur] = useState<TikurConfig | null>(null);
  const { refresh } = useAuth();

  const loadPlans = useCallback(() => {
    setPlansFailed(false);
    get<Plan[]>("/payments/plans")
      .then(setPlans)
      .catch(() => setPlansFailed(true));
  }, []);

  useEffect(() => {
    // Buying a plan is an account action, so the whole page is gated, not just
    // the checkout button. A deep link from a chat lands here logged out;
    // send it to sign-in and come straight back.
    if (!loading && !token) router.replace("/auth?next=/premium");
  }, [loading, token, router]);

  useEffect(() => {
    if (!token) return;
    loadPlans();
    // The catalogue strip further down is decoration; its absence costs nothing.
    get<HomeData>("/home").then(setHome).catch(() => undefined);
  }, [loadPlans, token]);

  useEffect(() => {
    // Public on purpose: the checkout page needs to know whether the bank rail
    // exists before it asks anyone to sign in and pick a plan.
    get<TikurConfig>("/payments/tikur/config")
      .then((c) => {
        setTikur(c);
        if (c.enabled) setMethod("tikur");
      })
      .catch(() => setTikur({ enabled: false, businessName: "Syncourse", timeoutMinutes: 15, rails: {} }));
  }, []);

  const methods = tikur?.enabled === false ? METHODS.filter((m) => m.value !== "tikur") : METHODS;

  const current = plans.find((p) => p.id === selected) ?? plans[0];

  const startCheckout = async (planId: string) => {
    if (!token) {
      router.push("/auth?next=/premium");
      return;
    }
    try {
      const r =
        method === "tikur"
          ? await post<CheckoutResult>("/payments/tikur/checkout", { planId })
          : await post<CheckoutResult>("/payments/checkout", {
              planId,
              method,
              currency: method === "telebirr" ? "ETB" : "USD",
            });
      setSelected(planId);
      setCheckout(r);
      setReference("");
      setPaid(false);
      if (r.redirectUrl && method !== "crypto") {
        window.location.href = r.redirectUrl;
      }
      // The hosted page is the fastest path: it shows the account, collects the
      // receipt and asks the gateway to verify. The panel below also allows the
      // same receipt to be pasted here, for anyone who transfers from their own
      // banking app and never opens the hosted page.
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const submitReference = async () => {
    if (!checkout || !reference.trim()) return;
    try {
      if (method === "tikur") {
        const r = await post<{ status: string; message: string; payerName?: string | null }>(
          "/payments/tikur/verify",
          { subscriptionId: checkout.subscriptionId, transactionLink: reference.trim() },
        );
        setToast(r.message);
        setReference("");
        if (r.status === "completed") {
          setPaid(true);
          void refresh();
        }
        return;
      }
      const r = await post<{ submitted: boolean; message: string }>(
        `/payments/subscriptions/${checkout.subscriptionId}/reference`,
        { reference },
      );
      setToast(r.message);
      setReference("");
      setPaid(true);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  /* Someone who pays on the hosted page comes back to this tab still open. The
     webhook normally lands first, but a late or blocked callback must not leave
     them staring at "pending" forever: ask the gateway for the authoritative
     state and let the server settle it. */
  useEffect(() => {
    if (method !== "tikur" || !checkout?.paymentNumber || paid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await get<{ status: string }>(`/payments/tikur/status/${checkout.paymentNumber}`);
        if (cancelled) return;
        if (s.status === "completed") {
          setPaid(true);
          void refresh();
        }
      } catch {
        // A network blip is not a failed payment; the next tick retries.
      }
    };
    const id = setInterval(tick, 6000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [method, checkout?.paymentNumber, paid, refresh]);

  const price = (p: Plan) => (method === "telebirr" || method === "tikur" ? `${p.priceEtb} ETB` : `$${p.priceUsd}`);
  const methodLabel = methods.find((m) => m.value === method)?.label ?? method;
  /** Receiving accounts: the session's own copy first, then the server's config. */
  const rails = checkout?.methods ?? tikur?.rails ?? {};
  const heroImages = (home?.trending ?? []).slice(0, 6).map((c) => c.thumbnailUrl).filter(Boolean) as string[];

  // Also covers the prerendered HTML: at build time there is no session, so the
  // page ships as a placeholder rather than a readable price list.
  if (loading || !token) {
    return (
      <main className="page">
        <MobileHeader title="Premium" />
        <div className="sk-stack" role="status" aria-busy="true" style={{ marginTop: 24 }}>
          <span className="sk-label">Checking your session…</span>
          {[0, 1, 2].map((i) => (
            <Sk key={i} className="sk-plan" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Premium" />

      {/* hero — blurred course collage background */}
      <div className="premium-hero">
        {heroImages.length > 0 && (
          <div className="premium-hero__bg">
            {heroImages.map((url, i) => (
              <CoverImage key={i} src={url} transform={{ width: 320 }} eager />
            ))}
          </div>
        )}
        <div className="premium-hero__content">
          <span className="eyebrow">Syncourse premium</span>
          <h1 className="display">Every lesson.<br />No friction.</h1>
          <p>
            Unlock full-speed downloads, offline notes, and uninterrupted course previews. Choose a fixed pass or a recurring membership.
          </p>
          <div className="premium-hero__features">
            {[
              ["Preview instantly", "See the right lesson before you commit."],
              ["Full-speed downloads", "Keep course files and notes ready offline."],
              ["Zero interruptions", "Learn without ad gates or detours."],
            ].map(([title, text]) => (
              <div key={title}>
                <Zap size={15} className="rating" />
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* payment method + fixed-duration plan header */}
      <section className="rail" style={{ marginTop: 40 }}>
        <div className="section-head">
          <h2>Choose your payment method</h2>
          <span className="muted mono" style={{ fontSize: 10 }}>Fixed passes do not auto-renew</span>
        </div>
        <h3 style={{ fontSize: 21, margin: "0 0 4px" }}>Choose a fixed-duration plan</h3>
        <p className="muted" style={{ fontSize: 12, margin: "0 0 18px", lineHeight: 1.6 }}>
          Direct plans do not auto-renew. Switch methods without losing your plan choice.
        </p>

        {/* payment methods — cards, not pills */}
        <div className="method-grid">
          {methods.map((m) => (
            <button
              key={m.value}
              className={`method-card ${method === m.value ? "selected" : ""}`}
              onClick={() => {
                setMethod(m.value);
                setCheckout(null);
                setPaid(false);
              }}
            >
              <span className="method-card__icon icon-badge icon-badge--amber">{m.icon}</span>
              <span className="method-card__body">
                <strong>
                  {m.label} {m.recommended && <span className="badge badge--solid" style={{ fontSize: 9, marginLeft: 6 }}>Recommended</span>}
                </strong>
                <small>{m.sub}</small>
              </span>
              <span className="method-card__radio">{method === m.value && <Check size={12} />}</span>
            </button>
          ))}
        </div>

        {/* plans: selectable rows + summary panel */}
        <div className="plans-layout">
          <div className="plans-list">
            {plans.map((p) => (
              <button
                key={p.id}
                className={`plan-row ${selected === p.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(p.id);
                  setCheckout(null);
                }}
              >
                <span className="plan-row__radio">
                  <span className={selected === p.id ? "on" : ""} />
                </span>
                <span className="plan-row__body">
                  <strong>
                    {p.name} {p.isBestValue && <span className="badge badge--solid" style={{ fontSize: 9, marginLeft: 8 }}>Best value</span>}
                  </strong>
                  <small>{p.durationDays} days · access on every device · no renewal</small>
                  {p.weeklyEtb > 0 && (
                    <small className="muted" style={{ display: "block", marginTop: 2 }}>
                      ≈ {p.weeklyEtb} ETB / week
                    </small>
                  )}
                </span>
                <span className="plan-row__price">{price(p)}</span>
              </button>
            ))}
            {plans.length === 0 &&
              (plansFailed ? (
                <LoadError
                  icon="💳"
                  title="We couldn't load the plans"
                  body="Prices come from our servers and that request failed. Nothing was charged — try again."
                  onRetry={loadPlans}
                  compact
                />
              ) : (
                <div role="status" aria-busy="true" className="sk-stack">
                  <span className="sk-label">Loading plans…</span>
                  {[0, 1, 2].map((i) => (
                    <Sk key={i} className="sk-plan" />
                  ))}
                </div>
              ))}
          </div>

          {/* summary panel with the actual purchase CTA */}
          {current && (
            <aside className="plan-summary">
              <span className="eyebrow">Your selection</span>
              <h3>{current.name}</h3>
              <div className="plan-summary__price">{price(current)}</div>
              <p className="muted" style={{ fontSize: 12 }}>
                Pay with {methodLabel} securely — {current.durationDays} days of Premium, no auto-renewal.
              </p>
              <button className="btn primary" style={{ width: "100%" }} onClick={() => startCheckout(current.id)}>
                Continue with {methodLabel} <ArrowRight size={14} />
              </button>
              <a href="mailto:support@syncourse.app" className="plan-summary__support">
                <MessageCircle size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Contact support — we answer fast
              </a>
            </aside>
          )}
        </div>

        {/* checkout flow */}
        {checkout && (
          <div className="dark-panel dark-panel--pad-lg" style={{ marginTop: 20 }}>
            {paid ? (
              <div>
                <Check className="rating" />
                <h3>
                  {method === "tikur" ? "Payment verified — Premium is unlocked." : "Payment reference submitted."}
                </h3>
                <p className="muted">
                  {method === "tikur"
                    ? "The transfer matched the plan amount and landed in the receiving account. Every plan and course is open on this account now."
                    : `We will verify your ${method} payment and unlock Premium on this device.`}
                </p>
              </div>
            ) : method === "tikur" ? (
              <div style={{ fontSize: 13 }}>
                <h3>Pay {checkout.amount?.toLocaleString()} ETB</h3>
                <p className="muted" style={{ margin: "4px 0 12px", lineHeight: 1.65 }}>
                  Transfer the exact amount from your bank app or wallet. Tikur Pay checks the transfer
                  against the bank ledger — no screenshot is trusted on its own.
                </p>

                {Object.keys(rails).length > 0 && (
                  <div className="dark-panel dark-panel--row" style={{ display: "grid", gap: 6 }}>
                    {Object.entries(rails).map(([key, rail]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span className="muted">
                          {key.toUpperCase()} · {rail.accountName ?? tikur?.businessName}
                        </span>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {rail.accountNumber ?? rail.phoneNumber ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {checkout.checkoutUrl && (
                  <a
                    href={checkout.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn primary"
                    style={{ display: "inline-block", marginTop: 12 }}
                  >
                    Open secure checkout <ArrowRight size={14} />
                  </a>
                )}

                <h3 style={{ marginTop: 22 }}>Already transferred? Paste the receipt</h3>
                <input
                  className="form-input"
                  placeholder="https://mbreciept.cbe.com.et/… or FT26…"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  autoComplete="off"
                />
                <p className="muted" style={{ fontSize: 11, margin: "2px 0 16px" }}>
                  The receipt link or the FT transaction number. Each transfer unlocks one account only —
                  a number that has already been used is rejected.
                </p>
                <button className="btn primary" onClick={submitReference} disabled={!reference.trim()}>
                  Verify payment <ShieldCheck size={14} />
                </button>
                <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                  This page also checks the gateway every few seconds, so paying on the hosted page unlocks
                  Premium here without reloading.
                </p>
              </div>
            ) : method === "telebirr" && checkout.steps ? (
              <div style={{ fontSize: 13 }}>
                <h3>{checkout.steps.step1.title}</h3>
                <p className="muted" style={{ margin: "4px 0 12px" }}>{checkout.steps.step1.text}</p>
                <div className="dark-panel dark-panel--row" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">{checkout.steps.step1.accountName}</span>
                  <span className="mono" style={{ fontWeight: 700, color: "hsl(var(--foreground))" }}>{checkout.steps.step1.accountNumber}</span>
                </div>
                <h3 style={{ marginTop: 20 }}>{checkout.steps.step2.title}</h3>
                <input
                  className="form-input"
                  placeholder="e.g. DGT2C7H1S2"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <p className="muted" style={{ fontSize: 11, margin: "2px 0 16px" }}>{checkout.steps.step2.hint}</p>
                <button className="btn primary" onClick={submitReference} disabled={!reference.trim()}>
                  I have paid · submit reference <ArrowRight size={14} />
                </button>
              </div>
            ) : method === "crypto" ? (
              <div>
                <h3>Continue to a secure crypto invoice</h3>
                <p className="muted">USDT, BTC, ETH and more. Premium activates once the network confirms.</p>
                {checkout.redirectUrl && (
                  <a href={checkout.redirectUrl} target="_blank" rel="noreferrer" className="btn primary" style={{ display: "inline-block" }}>
                    Open crypto invoice <ArrowRight size={14} />
                  </a>
                )}
              </div>
            ) : (
              <div>
                <h3>Continue to secure checkout</h3>
                <p className="muted">You&apos;ll be redirected to the payment page to finish.</p>
                {checkout.redirectUrl && (
                  <a href={checkout.redirectUrl} target="_blank" rel="noreferrer" className="btn primary" style={{ display: "inline-block" }}>
                    Proceed to payment <ArrowRight size={14} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <p className="muted" style={{ fontSize: 11, marginTop: 25 }}>
        By subscribing you agree to Syncourse{" "}
        <Link href="/legal/terms" style={{ textDecoration: "underline" }}>Terms</Link>,{" "}
        <Link href="/legal/privacy" style={{ textDecoration: "underline" }}>Privacy</Link>, and{" "}
        <Link href="/legal/refund" style={{ textDecoration: "underline" }}>Refund Policy</Link>.
      </p>

      <Toast message={toast} />
    </main>
  );
}
