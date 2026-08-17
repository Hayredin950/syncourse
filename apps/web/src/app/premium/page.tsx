"use client";

import { useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CreditCard, MessageCircle, Wallet, Zap } from "lucide-react";
import { get, post } from "@/lib/api";
import type { HomeData, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { MobileHeader } from "@/components/Nav";

interface CheckoutResult {
  subscriptionId: string;
  status: string;
  steps?: {
    step1: { title: string; text: string; accountName: string; accountNumber: string };
    step2: { title: string; hint: string };
  };
  redirectUrl?: string;
}

const METHODS: { value: string; label: string; sub: string; icon: React.ReactNode; recommended?: boolean }[] = [
  { value: "telebirr", label: "Telebirr", sub: "Ethiopia · mobile money", icon: <Wallet size={17} /> },
  { value: "crypto", label: "Crypto", sub: "USDT · BTC · ETH · SOL", icon: <Zap size={17} /> },
  { value: "stripe", label: "Card & PayPal", sub: "Worldwide · Visa / Mastercard", icon: <CreditCard size={17} />, recommended: true },
];

type MethodValue = (typeof METHODS)[number]["value"];

export default function PremiumPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [method, setMethod] = useState<MethodValue>("telebirr");
  const [selected, setSelected] = useState("6m");
  const [home, setHome] = useState<HomeData | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  const [toast, setToast] = useState("");
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    get<Plan[]>("/payments/plans").then(setPlans).catch(() => {});
    get<HomeData>("/home").then(setHome).catch(() => {});
  }, []);

  const current = plans.find((p) => p.id === selected) ?? plans[0];

  const startCheckout = async (planId: string) => {
    if (!token) {
      router.push("/auth?next=/premium");
      return;
    }
    try {
      const currency = method === "telebirr" ? "ETB" : "USD";
      const r = await post<CheckoutResult>("/payments/checkout", { planId, method, currency });
      setSelected(planId);
      setCheckout(r);
      setReference("");
      setPaid(false);
      if (r.redirectUrl && method !== "crypto") {
        window.location.href = r.redirectUrl;
      }
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const submitReference = async () => {
    if (!checkout || !reference.trim()) return;
    try {
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

  const price = (p: Plan) => (method === "telebirr" ? `${p.priceEtb} ETB` : `$${p.priceUsd}`);
  const methodLabel = METHODS.find((m) => m.value === method)!.label;
  const heroImages = (home?.trending ?? []).slice(0, 6).map((c) => c.thumbnailUrl).filter(Boolean) as string[];

  return (
    <main className="page" style={{ maxWidth: 1000 }}>
      <MobileHeader title="Premium" />

      {/* hero — blurred course collage background */}
      <div className="premium-hero">
        {heroImages.length > 0 && (
          <div className="premium-hero__bg">
            {heroImages.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={cloudinaryUrl(url, { width: 320 }) ?? undefined} alt="" aria-hidden />
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
          {METHODS.map((m) => (
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
                  {m.label} {m.recommended && <span className="badge primary" style={{ fontSize: 9, marginLeft: 6 }}>Recommended</span>}
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
                    {p.name} {p.isBestValue && <span className="badge primary" style={{ fontSize: 9, marginLeft: 8 }}>Best value</span>}
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
            {plans.length === 0 && (
              <div className="dark-panel" style={{ padding: 24, textAlign: "center" }}>
                <p className="muted" style={{ margin: 0 }}>Loading plans…</p>
              </div>
            )}
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
                Continue with {methodLabel} <ArrowRight size={14} style={{ display: "inline", verticalAlign: "middle" }} />
              </button>
              <a href="mailto:support@syncourse.app" className="plan-summary__support">
                <MessageCircle size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Contact support — we answer fast
              </a>
            </aside>
          )}
        </div>

        {/* checkout flow */}
        {checkout && (
          <div className="dark-panel" style={{ padding: 24, marginTop: 20 }}>
            {paid ? (
              <div>
                <Check className="rating" />
                <h3>Payment reference submitted.</h3>
                <p className="muted">We will verify your {method} payment and unlock Premium on this device.</p>
              </div>
            ) : method === "telebirr" && checkout.steps ? (
              <div style={{ fontSize: 13 }}>
                <h3>{checkout.steps.step1.title}</h3>
                <p className="muted" style={{ margin: "4px 0 12px" }}>{checkout.steps.step1.text}</p>
                <div className="dark-panel" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between" }}>
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
                  I have paid · submit reference <ArrowRight size={14} style={{ display: "inline", verticalAlign: "middle" }} />
                </button>
              </div>
            ) : method === "crypto" ? (
              <div>
                <h3>Continue to a secure crypto invoice</h3>
                <p className="muted">USDT, BTC, ETH and more. Premium activates once the network confirms.</p>
                {checkout.redirectUrl && (
                  <a href={checkout.redirectUrl} target="_blank" rel="noreferrer" className="btn primary" style={{ display: "inline-block" }}>
                    Open crypto invoice <ArrowRight size={14} style={{ display: "inline", verticalAlign: "middle" }} />
                  </a>
                )}
              </div>
            ) : (
              <div>
                <h3>Continue to secure checkout</h3>
                <p className="muted">You&apos;ll be redirected to the payment page to finish.</p>
                {checkout.redirectUrl && (
                  <a href={checkout.redirectUrl} target="_blank" rel="noreferrer" className="btn primary" style={{ display: "inline-block" }}>
                    Proceed to payment <ArrowRight size={14} style={{ display: "inline", verticalAlign: "middle" }} />
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

      {toast && (
        <div className="sheet" style={{ pointerEvents: "none", background: "transparent", display: "grid", placeItems: "end center", paddingBottom: 40 }}>
          <div className="dark-panel" style={{ padding: "14px 22px", background: "#f6a437", color: "#211308", fontWeight: 800, fontSize: 12 }}>
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
