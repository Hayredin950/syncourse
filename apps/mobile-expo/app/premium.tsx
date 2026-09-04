import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Empty, Failed } from "../components/Empty";
import { Note } from "../components/Note";
import { Press } from "../components/Press";
import { Sheet } from "../components/Sheet";
import { Sk } from "../components/Skeleton";
import { Text, TextInput } from "../components/Type";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/tokens";
import type { CheckoutResult, Plan } from "../lib/types";

/**
 * The paywall.
 *
 * Three payment rails, one of which — Telebirr — settles by hand: the app shows
 * an account number, the reader pays in another app and comes back with a
 * reference. That handover is the fragile part, so it now lives in the shared
 * `Sheet`, which keeps its own scroll, sits above the gesture bar and can always
 * be closed. It also fixes an unreachable screen: the old modal's `visible` was
 * gated on `!paid`, so submitting the reference unmounted the very branch written
 * to confirm it, and only a system Alert said anything had happened.
 */
const METHODS: {
  value: string;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  recommended?: boolean;
}[] = [
  { value: "telebirr", label: "Telebirr", sub: "Ethiopia · mobile money", icon: "phone-portrait-outline" },
  { value: "crypto", label: "Crypto", sub: "USDT · BTC · ETH · SOL", icon: "flash-outline" },
  {
    value: "stripe",
    label: "Card & PayPal",
    sub: "Worldwide · Visa / Mastercard",
    icon: "card-outline",
    recommended: true,
  },
];

/** Was "⚡", "⬇" and "🚫" at 20px, three glyphs from three different fonts. */
const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { icon: "flash", title: "Stream instantly", desc: "No queues, no limit on playback quality" },
  { icon: "cloud-download", title: "Full-speed downloads", desc: "Offline lessons with a quality picker" },
  { icon: "ban", title: "Zero ads", desc: "An ad-free experience across web and app" },
];

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function PremiumScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A plan row is one line of type and a price; full width, it runs most of a
  // metre across a tablet with the price stranded at the far edge.
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const { data: plans, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["plans"],
    queryFn: api.plans,
  });
  const [method, setMethod] = useState<string>("telebirr");
  const [selected, setSelected] = useState<string>("");
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  // The API's own confirmation sentence. Non-null means the reference is in.
  const [submitted, setSubmitted] = useState<string | null>(null);

  const current = plans?.find((p) => p.id === selected) ?? plans?.[0];
  const methodLabel = METHODS.find((m) => m.value === method)?.label ?? method;
  const price = (p: Plan) => (method === "telebirr" ? `${p.priceEtb.toLocaleString()} ETB` : `$${p.priceUsd}`);

  const reset = () => {
    setCheckout(null);
    setSubmitted(null);
    setReference("");
  };

  const checkoutMut = useMutation({
    mutationFn: (planId: string) => api.checkout(planId, method),
    onSuccess: (r: CheckoutResult) => {
      setCheckout(r);
      setReference("");
      setSubmitted(null);
      /* stripe → straight redirect; telebirr → the sheet below; crypto → the
         panel below, which is a page-shaped version of the confirm dialog this
         used to raise ("Open the secure invoice to finish payment", Cancel /
         Open invoice) over a screen that was already offering the same button. */
      if (r.redirectUrl && method === "stripe") {
        void Linking.openURL(r.redirectUrl);
      }
    },
    /* There was an `onError` here raising `Alert.alert("Checkout", …)`: an OS
       dialog whose title said less than the button that opened it, and which had
       to be dismissed before the plan could be changed. The failure prints under
       the button now — `checkoutMut.error`, which react-query clears on retry. */
  });

  const referenceMut = useMutation({
    mutationFn: () => api.submitReference(checkout!.subscriptionId, reference.trim()),
    // The sheet stays open and turns into the confirmation, so an Alert on top of
    // it would be the same sentence twice.
    onSuccess: (r) => setSubmitted(r.message || "We will verify your payment and unlock Premium."),
  });

  /** Whatever react-query is holding, as a sentence. */
  const errText = (e: unknown, fallback: string) =>
    e instanceof Error && e.message ? e.message : fallback;

  const startCheckout = (planId: string) => {
    if (!token) {
      router.push("/auth?next=/premium");
      return;
    }
    setSelected(planId);
    checkoutMut.mutate(planId);
  };

  return (
    <ScrollView
      style={styles.screen}
      /* Was a flat 60. The legal links are the last row on the page, and on a
         gesture-bar phone they sat under the bar. */
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: gutter, paddingBottom: Math.max(60, insets.bottom + 40) },
      ]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <View style={styles.badge}>
        <Ionicons name="ribbon" size={13} color={colors.accent} />
        <Text style={styles.badgeText}>Syncourse Premium</Text>
      </View>
      <Text style={styles.title}>Every course.{"\n"}Full speed. No ads.</Text>

      {/* Premium readers used to land on the full purchase funnel with nothing
          saying they already had it. */}
      {user?.planType === "premium" && (
        <View style={styles.active}>
          <Ionicons name="checkmark-circle" size={17} color={colors.success} />
          <Text style={styles.activeText}>
            Premium is active{user.planExpiresAt ? ` until ${day(user.planExpiresAt)}` : ""}.
          </Text>
        </View>
      )}

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Ionicons name={b.icon} size={18} color={colors.accent} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.muted}>{b.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>How would you like to pay?</Text>
      <Text style={styles.sub}>Every plan runs for a fixed number of days — nothing auto-renews.</Text>

      <View style={styles.methodGrid}>
        {METHODS.map((m) => {
          const on = method === m.value;
          return (
            <Press
              key={m.value}
              style={[styles.methodCard, on && styles.cardOn]}
              onPress={() => {
                setMethod(m.value);
                reset();
              }}
              accessibilityLabel={`Pay with ${m.label}${m.recommended ? ", recommended" : ""}`}
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.methodIcon, on && styles.methodIconOn]}>
                <Ionicons name={m.icon} size={17} color={on ? colors.accent : colors.muted} />
              </View>
              <View style={styles.grow}>
                <View style={styles.rowTop}>
                  <Text style={styles.methodLabel} numberOfLines={1}>
                    {m.label}
                  </Text>
                  {/* Was " · Recommended" inside the label, so it truncated first. */}
                  {m.recommended && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>RECOMMENDED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.muted} numberOfLines={1}>
                  {m.sub}
                </Text>
              </View>
              <Radio on={on} />
            </Press>
          );
        })}
      </View>

      {isLoading ? (
        // Three boxes at plan-row height. The price list is the reason the reader
        // is on this screen, and a centred spinner both said nothing and shoved
        // the page down the moment the prices arrived.
        <View style={styles.plansList}>
          {[0, 1, 2].map((i) => (
            <Sk key={i} style={styles.planSk} />
          ))}
        </View>
      ) : error ? (
        <Failed title="Could not load the plans" onRetry={() => refetch()} />
      ) : (plans ?? []).length === 0 ? (
        <Empty
          icon="pricetags-outline"
          title="No plans on sale right now"
          body="Get in touch and we'll sort something out for you."
          action={{
            label: "Contact support",
            onPress: () => void Linking.openURL("mailto:support@syncourse.app"),
          }}
        />
      ) : (
        <>
          <View style={styles.plansList}>
            {(plans ?? []).map((p) => {
              // Against `current`, not `selected`: with nothing picked the summary
              // below already defaults to the first plan, and no row was ticked.
              const on = current?.id === p.id;
              return (
                <Press
                  key={p.id}
                  style={[styles.planRow, on && styles.cardOn]}
                  onPress={() => {
                    setSelected(p.id);
                    reset();
                  }}
                  accessibilityLabel={`${p.name}, ${price(p)}, ${p.durationDays} days${
                    p.isBestValue ? ", best value" : ""
                  }`}
                  accessibilityState={{ selected: on }}
                >
                  <Radio on={on} />
                  <View style={styles.grow}>
                    <View style={styles.rowTop}>
                      <Text style={styles.planName}>{p.name}</Text>
                      {p.isBestValue && (
                        <View style={styles.tagSolid}>
                          <Text style={styles.tagSolidText}>BEST VALUE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.muted}>{p.durationDays} days · every device · no renewal</Text>
                    {p.weeklyEtb > 0 && <Text style={styles.finePrint}>≈ {p.weeklyEtb} ETB / week</Text>}
                  </View>
                  <Text style={styles.planPrice}>{price(p)}</Text>
                </Press>
              );
            })}
          </View>

          {current && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{current.name}</Text>
              <Text style={styles.summaryPrice}>{price(current)}</Text>
              <Text style={styles.muted}>
                {current.durationDays} days of Premium, paid with {methodLabel}. No auto-renewal and no card
                kept on file.
              </Text>
              <Press
                style={styles.primaryBtn}
                disabled={checkoutMut.isPending}
                onPress={() => startCheckout(current.id)}
                haptic={token ? "success" : undefined}
                accessibilityLabel={token ? `Continue with ${methodLabel}` : "Sign in to continue"}
              >
                <Ionicons name={token ? "arrow-forward" : "log-in-outline"} size={16} color={colors.onAccent} />
                {/* Was a lone "…", which reads as a truncated label rather than as
                    work in flight. */}
                <Text style={styles.primaryLabel}>
                  {!token
                    ? "Sign in to continue"
                    : checkoutMut.isPending
                      ? "Starting checkout…"
                      : `Continue with ${methodLabel}`}
                </Text>
              </Press>
              <Press
                style={styles.support}
                onPress={() => void Linking.openURL("mailto:support@syncourse.app")}
                accessibilityLabel="Email support"
              >
                <Ionicons name="mail-outline" size={14} color={colors.muted} />
                <Text style={styles.supportLabel}>Contact support — we answer fast</Text>
              </Press>
              {!!checkoutMut.error && (
                <Note
                  bad
                  text={errText(checkoutMut.error, "Could not start checkout. Try again in a moment.")}
                  style={styles.noteGap}
                />
              )}
            </View>
          )}
        </>
      )}

      {/* crypto / card hand-off */}
      {checkout && method !== "telebirr" && (
        <View style={styles.resultPanel}>
          <View style={styles.resultHead}>
            <View style={styles.benefitIcon}>
              <Ionicons
                name={method === "crypto" ? "logo-bitcoin" : "lock-closed"}
                size={17}
                color={colors.accent}
              />
            </View>
            <View style={styles.grow}>
              <Text style={styles.resultTitle}>
                {method === "crypto" ? "Your crypto invoice is ready" : "Your checkout is ready"}
              </Text>
              <Text style={styles.muted}>
                {method === "crypto"
                  ? "USDT, BTC, ETH and more — Premium unlocks once the network confirms."
                  : "Finish on the payment page and Premium unlocks straight away."}
              </Text>
            </View>
          </View>
          {checkout.redirectUrl && (
            <Press
              style={styles.primaryBtn}
              onPress={() => void Linking.openURL(checkout.redirectUrl as string)}
              haptic
              accessibilityLabel={method === "crypto" ? "Open the crypto invoice" : "Proceed to payment"}
            >
              <Ionicons name="open-outline" size={16} color={colors.onAccent} />
              <Text style={styles.primaryLabel}>
                {method === "crypto" ? "Open crypto invoice" : "Proceed to payment"}
              </Text>
            </Press>
          )}
          <Press style={styles.dismiss} onPress={reset} accessibilityLabel="Start over">
            <Text style={styles.dismissLabel}>Start over</Text>
          </Press>
        </View>
      )}

      {/* Was a grey sentence naming three documents none of which could be opened. */}
      <View style={styles.legal}>
        <Text style={styles.legalText}>By subscribing you agree to our</Text>
        <View style={styles.legalRow}>
          {([
            ["terms", "Terms"],
            ["privacy", "Privacy"],
            ["refund", "Refund Policy"],
          ] as const).map(([slug, label]) => (
            <Press
              key={slug}
              style={styles.legalLink}
              onPress={() => router.push(`/legal/${slug}`)}
              accessibilityLabel={label}
            >
              <Text style={styles.legalLinkText}>{label}</Text>
            </Press>
          ))}
        </View>
      </View>

      {/* Telebirr settles by hand. Mounted for as long as a Telebirr checkout is
          open — including after the reference lands, which is the moment this
          sheet has the most to say. */}
      <Sheet
        visible={!!checkout && method === "telebirr"}
        onClose={reset}
        title={submitted ? "Reference received" : "Pay with Telebirr"}
        subtitle={submitted || !current ? undefined : `${current.name} · ${price(current)}`}
        footer={
          submitted ? (
            <Press style={styles.primaryBtn} onPress={reset} accessibilityLabel="Done">
              <Text style={styles.primaryLabel}>Done</Text>
            </Press>
          ) : (
            <Press
              style={styles.primaryBtn}
              disabled={!reference.trim() || referenceMut.isPending}
              onPress={() => referenceMut.mutate()}
              haptic="success"
              accessibilityLabel="I have paid, submit the reference"
            >
              <Ionicons name="checkmark" size={16} color={colors.onAccent} />
              <Text style={styles.primaryLabel}>
                {referenceMut.isPending ? "Submitting…" : "I have paid · submit reference"}
              </Text>
            </Press>
          )
        }
      >
        {submitted ? (
          <View style={styles.done}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark" size={24} color={colors.success} />
            </View>
            <Text style={styles.doneTitle}>Payment reference submitted</Text>
            <Text style={styles.doneBody}>{submitted}</Text>
          </View>
        ) : checkout?.steps ? (
          <>
            <Step n={1} title={checkout.steps.step1.title} />
            <Text style={styles.stepText}>{checkout.steps.step1.text}</Text>
            <View style={styles.accountBox}>
              <View style={styles.grow}>
                <Text style={styles.fieldLabel}>Account name</Text>
                <Text style={styles.accountName}>{checkout.steps.step1.accountName}</Text>
              </View>
              <View style={styles.accountNumberCol}>
                <Text style={styles.fieldLabel}>Number</Text>
                {/* There is no clipboard module in this app, but a selectable Text
                    gives both platforms their own long-press copy for free. */}
                <Text style={styles.accountNumber} selectable>
                  {checkout.steps.step1.accountNumber}
                </Text>
              </View>
            </View>
            <Text style={styles.hint}>Long-press the number to copy it.</Text>

            <Step n={2} title={checkout.steps.step2.title} />
            <TextInput
              style={styles.input}
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. DGT2C7H1S2"
              placeholderTextColor={colors.dim}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (reference.trim() && !referenceMut.isPending) referenceMut.mutate();
              }}
            />
            <Text style={styles.hint}>{checkout.steps.step2.hint}</Text>
            {!!referenceMut.error && (
              <Note
                bad
                text={errText(referenceMut.error, "Could not submit that reference. Check it and try again.")}
                style={styles.noteGap}
              />
            )}
          </>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

/** The selected-state dot, shared by the method cards and the plan rows. */
function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>;
}

/** A numbered step heading. The two Telebirr steps used to be plain bold lines. */
function Step({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 18, paddingBottom: 60 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 26,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 33,
    marginTop: 14,
  },
  active: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 16,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.successLine,
    backgroundColor: colors.successSoft,
  },
  activeText: { flex: 1, color: colors.success, fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  grow: { flex: 1, minWidth: 0 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  benefits: { gap: 12, marginTop: 22 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 26, letterSpacing: -0.2 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 5, marginBottom: 14, lineHeight: 17 },
  methodGrid: { gap: 9 },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  // One rule for the method card and the plan row alike: a lone amber border was
  // the only mark of a choice, and on a warm near-black it is easy to miss.
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  methodIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  methodIconOn: { backgroundColor: "rgba(243,143,39,0.2)" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  methodLabel: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  tagSolid: {
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagSolidText: { color: colors.onAccent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  plansList: { gap: 9, marginTop: 16 },
  planSk: { height: 78, borderRadius: radius.md },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 78,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  planName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  finePrint: { color: colors.dim, fontSize: 11 },
  planPrice: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 16,
  },
  summaryTitle: { color: colors.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  summaryPrice: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginVertical: 5,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    marginTop: 14,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  support: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    marginTop: 6,
  },
  supportLabel: { color: colors.muted, fontSize: 12, textDecorationLine: "underline" },
  noteGap: { marginTop: 12 },
  resultPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 18,
  },
  resultHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  resultTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  dismiss: { minHeight: 42, alignItems: "center", justifyContent: "center", marginTop: 4 },
  dismissLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "700" },
  legal: { alignItems: "center", marginTop: 28, gap: 2 },
  legalText: { color: colors.dim, fontSize: 11.5 },
  legalRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  legalLink: { minHeight: 36, justifyContent: "center", paddingHorizontal: 8 },
  legalLinkText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  step: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, marginBottom: 7 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  stepNumText: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  stepTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  stepText: { color: colors.body, fontSize: 13, lineHeight: 19 },
  accountBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
  },
  accountNumberCol: { alignItems: "flex-end" },
  fieldLabel: {
    color: colors.dim,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  accountName: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  // `fontFamily: "monospace"` is remapped to DM Mono by components/Type — the same
  // face the web sets figures in.
  accountNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "monospace",
    letterSpacing: 0.5,
  },
  hint: { color: colors.dim, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  done: { alignItems: "center", paddingVertical: 10 },
  doneIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successLine,
  },
  doneTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 14, textAlign: "center" },
  doneBody: { color: colors.body, fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
});
