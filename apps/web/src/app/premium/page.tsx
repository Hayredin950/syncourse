"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";

interface CheckoutResult {
  subscriptionId: string;
  status: string;
  steps?: {
    step1: { title: string; text: string; accountName: string; accountNumber: string };
    step2: { title: string; hint: string };
  };
  redirectUrl?: string;
}

export default function PremiumPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [method, setMethod] = useState<"telebirr" | "crypto" | "stripe">("telebirr");
  const [selected, setSelected] = useState("6m");
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  const [toast, setToast] = useState("");

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
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const price = (p: Plan) => (method === "telebirr" ? `${p.priceEtb} ETB` : `$${p.priceUsd}`);
  const weekly = (p: Plan) => (method === "telebirr" ? `${p.weeklyEtb} ETB/week` : `—`);

  return (
    <div className="pb-6">
      {/* header */}
      <div className="bg-gradient-to-b from-accent-soft to-transparent px-4 pb-6 pt-8 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">Syncourse Premium</div>
        <h1 className="mt-1 text-xl font-bold text-text">Every course. Full speed. No ads.</h1>
        <div className="mx-auto mt-4 max-w-[320px] space-y-2 text-left">
          {[
            ["⚡", "Stream instantly", "Videos in your browser, subtitles, no waiting."],
            ["⬇️", "Full-speed downloads", "Direct downloads at the fastest speed your connection can take."],
            ["🚫", "Zero ads", "Nothing between you and your learning, on any device."],
          ].map(([icon, title, body]) => (
            <div key={title} className="flex items-start gap-2.5 rounded-lg bg-surface/70 p-3">
              <span className="text-lg">{icon}</span>
              <div>
                <div className="text-sm font-semibold text-text">{title}</div>
                <div className="text-[11px] text-muted">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* method tabs */}
      <div className="px-4">
        <div className="text-center text-[11px] text-muted">Choose a fixed-duration plan — direct plans do not renew automatically.</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["telebirr", "Telebirr", "Ethiopia"],
              ["crypto", "Crypto", "USDT·BTC·ETH"],
              ["stripe", "Card & PayPal", "Worldwide"],
            ] as const
          ).map(([v, label, sub]) => (
            <button
              key={v}
              onClick={() => {
                setMethod(v);
                setCheckout(null);
              }}
              className={`rounded-lg border p-2 text-center ${method === v ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
            >
              <div className="text-xs font-semibold text-text">{label}</div>
              <div className="text-[10px] text-dim">{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* plans */}
      <div className="mt-4 space-y-2 px-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`relative rounded-xl border p-4 ${selected === p.id && checkout ? "border-accent bg-accent-soft/40" : "border-border bg-surface"}`}
          >
            {p.isBestValue && (
              <span className="absolute -top-2 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-black">
                BEST VALUE
              </span>
            )}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-text">{p.name}</div>
                <div className="text-[11px] text-dim">{p.durationDays} days · {weekly(p)}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-text">{price(p)}</div>
              </div>
            </div>
            {checkout && selected === p.id ? (
              method === "telebirr" && checkout.steps ? (
                <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs">
                  <div className="font-semibold text-text">STEP 1 — SEND {price(p)}</div>
                  <div className="mt-1 flex items-center justify-between rounded bg-surface px-3 py-2">
                    <span className="text-muted">{checkout.steps.step1.accountName}</span>
                    <span className="font-mono font-bold text-text">{checkout.steps.step1.accountNumber}</span>
                  </div>
                  <div className="mt-2 font-semibold text-text">STEP 2 — TRANSACTION NUMBER</div>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. DGT2C7H1S2"
                    className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-text placeholder:text-dim focus:border-accent focus:outline-none"
                  />
                  <div className="mt-1 text-[10px] text-dim">{checkout.steps.step2.hint}</div>
                  <button
                    onClick={submitReference}
                    disabled={!reference.trim()}
                    className="mt-2 w-full rounded-full bg-accent py-2 text-xs font-bold text-black disabled:opacity-40"
                  >
                    I&apos;ve paid — submit reference
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
                  {method === "crypto" ? (
                    <>Premium activates automatically once the network confirms your payment on the processor page.</>
                  ) : (
                    <>You&apos;ll be redirected to the secure checkout to finish payment.</>
                  )}
                  {checkout.redirectUrl && (
                    <a
                      href={checkout.redirectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block rounded-full bg-accent py-2 text-center text-xs font-bold text-black"
                    >
                      Proceed to payment
                    </a>
                  )}
                </div>
              )
            ) : (
              <button
                onClick={() => startCheckout(p.id)}
                className="mt-3 w-full rounded-full border border-accent py-2 text-xs font-bold text-accent hover:bg-accent-soft"
              >
                Choose {p.name}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 pt-4 text-center text-[10px] text-dim">
        By subscribing you agree to our <a href="/legal/terms" className="underline">Terms of Service</a>,{" "}
        <a href="/legal/privacy" className="underline">Privacy Policy</a> and{" "}
        <a href="/legal/refund" className="underline">Refund Policy</a>.
        <div className="mt-1">Need help? We answer fast.</div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
