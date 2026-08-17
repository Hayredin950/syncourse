"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Zap } from "lucide-react";
import { get, post } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
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

const METHODS = [
  { value: "telebirr", label: "Telebirr", sub: "Ethiopia" },
  { value: "crypto", label: "Crypto", sub: "USDT · BTC · ETH" },
  { value: "stripe", label: "Card & PayPal", sub: "Worldwide" },
] as const;

export default function PremiumPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [method, setMethod] = useState<"telebirr" | "crypto" | "stripe">("telebirr");
  const [selected, setSelected] = useState("6m");
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  const [toast, setToast] = useState("");
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    get<Plan[]>("/payments/plans").then(setPlans).catch(() => {});
  }, []);

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

  return (
    <main className="page" style={{ maxWidth: 920 }}>
      <MobileHeader title="Premium" />
      <span className="eyebrow">Syncourse premium</span>
      <h1 className="display">Every lesson.<br />No friction.</h1>
      <p className="muted" style={{ maxWidth: 500, lineHeight: 1.65 }}>
        Unlock full-speed downloads, offline notes, and uninterrupted course previews. Choose a fixed pass or a recurring membership.
      </p>

      <div className="category-grid" style={{ marginTop: 35, gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          ["Preview instantly", "See the right lesson before you commit."],
          ["Full-speed downloads", "Keep course files and notes ready offline."],
          ["Zero interruptions", "Learn without ad gates or detours."],
        ].map(([title, text]) => (
          <div className="category-tile" key={title}>
            <Zap size={17} className="rating" />
            <strong style={{ marginTop: 15 }}>{title}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <section className="rail">
        <div className="section-head">
          <h2>Choose your payment method</h2>
          <span className="muted mono" style={{ fontSize: 10 }}>Fixed passes do not auto-renew</span>
        </div>
        <div className="pills">
          {METHODS.map((m) => (
            <button
              key={m.value}
              className={`badge ${method === m.value ? "primary" : ""}`}
              onClick={() => {
                setMethod(m.value);
                setCheckout(null);
                setPaid(false);
              }}
            >
              {m.label} <span className="muted" style={{ fontWeight: 400 }}>{m.sub}</span>
            </button>
          ))}
        </div>

        <div className="plan-grid">
          {plans.map((p, i) => (
            <button
              key={p.id}
              className={`plan ${selected === p.id && checkout ? "selected" : ""}`}
              onClick={() => startCheckout(p.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="eyebrow">{p.isBestValue ? "Best value" : "Fixed duration"}</span>
                {p.isBestValue && <Zap size={17} className="rating" />}
              </div>
              <div style={{ textAlign: "left" }}>
                <h3>{p.name}</h3>
                <div className="price">{price(p)}</div>
                <p className="muted" style={{ margin: 0, fontSize: 11 }}>{p.durationDays} days · access on every device · no renewal</p>
              </div>
            </button>
          ))}
          {plans.length === 0 && (
            <div className="dark-panel" style={{ padding: 24, textAlign: "center" }}>
              <p className="muted" style={{ margin: 0 }}>Loading plans…</p>
            </div>
          )}
        </div>

        {checkout && (
          <div className="dark-panel" style={{ padding: 24 }}>
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
