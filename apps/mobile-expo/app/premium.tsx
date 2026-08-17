import { useMutation, useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { useAuth } from "../lib/auth";
import type { CheckoutResult, Plan } from "../lib/types";

const METHODS: { value: string; label: string; sub: string; icon: string; recommended?: boolean }[] = [
  { value: "telebirr", label: "Telebirr", sub: "Ethiopia · mobile money", icon: "📱" },
  { value: "crypto", label: "Crypto", sub: "USDT · BTC · ETH · SOL", icon: "⚡" },
  { value: "stripe", label: "Card & PayPal", sub: "Worldwide · Visa / Mastercard", icon: "💳", recommended: true },
];

export default function PremiumScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { data: plans, isLoading } = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const [method, setMethod] = useState<string>("telebirr");
  const [selected, setSelected] = useState<string>("");
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [reference, setReference] = useState("");
  const [paid, setPaid] = useState(false);

  const current = plans?.find((p) => p.id === selected) ?? plans?.[0];

  const checkoutMut = useMutation({
    mutationFn: (planId: string) => api.checkout(planId, method),
    onSuccess: (r: CheckoutResult) => {
      setCheckout(r);
      setReference("");
      setPaid(false);
      // stripe → straight redirect; crypto → open the invoice; telebirr → manual steps shown inline
      if (r.redirectUrl && method === "stripe") {
        void Linking.openURL(r.redirectUrl);
      } else if (r.redirectUrl && method === "crypto") {
        Alert.alert("Crypto invoice", "Open the secure invoice to finish payment.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open invoice", onPress: () => void Linking.openURL(r.redirectUrl as string) },
        ]);
      }
    },
    onError: (e: any) => Alert.alert("Checkout", e?.message ?? "Could not start checkout"),
  });

  const referenceMut = useMutation({
    mutationFn: () => api.submitReference(checkout!.subscriptionId, reference.trim()),
    onSuccess: (r) => {
      setPaid(true);
      Alert.alert("Reference submitted", r.message ?? "We will verify your payment and unlock Premium.");
    },
    onError: (e: any) => Alert.alert("Submit", e?.message ?? "Could not submit reference"),
  });

  const startCheckout = (planId: string) => {
    if (!token) {
      router.push("/auth?next=/premium");
      return;
    }
    setSelected(planId);
    checkoutMut.mutate(planId);
  };

  const price = (p: Plan) => (method === "telebirr" ? `${p.priceEtb} ETB` : `$${p.priceUsd}`);
  const methodLabel = METHODS.find((m) => m.value === method)?.label ?? method;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Every course.{"\n"}Full speed. No ads.</Text>

      <Benefit icon="⚡" title="Stream instantly" desc="No queues, no limits on playback quality" />
      <Benefit icon="⬇" title="Full-speed downloads" desc="Offline lessons with a quality picker" />
      <Benefit icon="🚫" title="Zero ads" desc="An ad-free experience across web and app" />

      <Text style={styles.heading}>Choose your payment method</Text>
      <Text style={styles.sub}>Choose a fixed-duration plan — direct plans do not auto-renew.</Text>

      {/* method cards */}
      <View style={styles.methodGrid}>
        {METHODS.map((m) => (
          <Pressable
            key={m.value}
            style={[styles.methodCard, method === m.value && styles.methodCardActive]}
            onPress={() => {
              setMethod(m.value);
              setCheckout(null);
              setPaid(false);
            }}
          >
            <Text style={styles.methodIcon}>{m.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodLabel} numberOfLines={1}>
                {m.label}
                {m.recommended ? " · Recommended" : ""}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>{m.sub}</Text>
            </View>
            <View style={[styles.radio, method === m.value && styles.radioOn]}>
              {method === m.value && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}
      </View>

      {/* plan rows + summary */}
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <View style={styles.plansList}>
            {(plans ?? []).map((p) => (
              <Pressable
                key={p.id}
                style={[styles.planRow, selected === p.id && styles.planRowActive]}
                onPress={() => {
                  setSelected(p.id);
                  setCheckout(null);
                }}
              >
                <View style={[styles.radio, selected === p.id && styles.radioOn]}>
                  {selected === p.id && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>
                    {p.name}
                    {p.isBestValue ? "  ·  BEST VALUE" : ""}
                  </Text>
                  <Text style={styles.muted}>{p.durationDays} days · access on every device · no renewal</Text>
                  {p.weeklyEtb > 0 && <Text style={[styles.muted, { fontSize: 11 }]}>≈ {p.weeklyEtb} ETB / week</Text>}
                </View>
                <Text style={styles.planPrice}>{price(p)}</Text>
              </Pressable>
            ))}
          </View>

          {current && (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{current.name}</Text>
              <Text style={styles.summaryPrice}>{price(current)}</Text>
              <Text style={styles.muted}>
                Pay with {methodLabel} securely — {current.durationDays} days of Premium, no auto-renewal.
              </Text>
              <Pressable
                style={[styles.primaryBtn, checkoutMut.isPending && { opacity: 0.5 }]}
                disabled={checkoutMut.isPending}
                onPress={() => startCheckout(current.id)}
              >
                <Text style={styles.primaryLabel}>
                  {checkoutMut.isPending ? "…" : `Continue with ${methodLabel}`}
                </Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL("mailto:support@syncourse.app")}>
                <Text style={styles.support}>Contact support — we answer fast</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Telebirr manual steps */}
      <Modal
        visible={!!checkout && method === "telebirr" && !paid}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckout(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {paid ? (
              <>
                <Text style={styles.sheetTitle}>Payment reference submitted.</Text>
                <Text style={styles.muted}>We will verify your {methodLabel} payment and unlock Premium.</Text>
              </>
            ) : checkout?.steps ? (
              <ScrollView>
                <Text style={styles.sheetTitle}>{checkout.steps.step1.title}</Text>
                <Text style={styles.muted}>{checkout.steps.step1.text}</Text>
                <View style={styles.accountBox}>
                  <Text style={styles.muted}>{checkout.steps.step1.accountName}</Text>
                  <Text style={styles.accountNumber}>{checkout.steps.step1.accountNumber}</Text>
                </View>
                <Text style={[styles.sheetTitle, { marginTop: 18 }]}>{checkout.steps.step2.title}</Text>
                <TextInput
                  style={styles.input}
                  value={reference}
                  onChangeText={setReference}
                  placeholder="e.g. DGT2C7H1S2"
                  placeholderTextColor={colors.dim}
                  autoCapitalize="characters"
                />
                <Text style={[styles.muted, { fontSize: 11, marginVertical: 6 }]}>{checkout.steps.step2.hint}</Text>
                <Pressable
                  style={[styles.primaryBtn, (!reference.trim() || referenceMut.isPending) && { opacity: 0.4 }]}
                  disabled={!reference.trim() || referenceMut.isPending}
                  onPress={() => referenceMut.mutate()}
                >
                  <Text style={styles.primaryLabel}>{referenceMut.isPending ? "…" : "I have paid · submit reference"}</Text>
                </Pressable>
              </ScrollView>
            ) : null}
            <Pressable style={styles.closeBtn} onPress={() => setCheckout(null)}>
              <Text style={styles.muted}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* crypto / card result panels */}
      {checkout && method !== "telebirr" && (
        <View style={styles.resultPanel}>
          <Text style={styles.sheetTitle}>
            {method === "crypto" ? "Continue to a secure crypto invoice" : "Continue to secure checkout"}
          </Text>
          <Text style={styles.muted}>
            {method === "crypto"
              ? "USDT, BTC, ETH and more — Premium activates once the network confirms."
              : "You'll be redirected to the payment page to finish."}
          </Text>
          {checkout.redirectUrl && (
            <Pressable style={styles.primaryBtn} onPress={() => void Linking.openURL(checkout.redirectUrl as string)}>
              <Text style={styles.primaryLabel}>
                {method === "crypto" ? "Open crypto invoice" : "Proceed to payment"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={[styles.muted, { marginTop: 24, textAlign: "center" }]}>
        By subscribing you agree to Syncourse's Terms, Privacy and Refund Policy.
      </Text>
    </ScrollView>
  );
}

function Benefit({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.muted}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, lineHeight: 32 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 22 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 12 },
  benefit: { flexDirection: "row", gap: 12, marginTop: 14 },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  methodGrid: { gap: 8 },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  methodCardActive: { borderColor: colors.accent },
  methodIcon: { fontSize: 18 },
  methodLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  plansList: { gap: 8, marginTop: 14 },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  planRowActive: { borderColor: colors.accent },
  planName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  planPrice: { color: colors.text, fontSize: 17, fontWeight: "800" },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 14,
  },
  summaryTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  summaryPrice: { color: colors.text, fontSize: 28, fontWeight: "800", marginVertical: 4 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
  support: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 12, textDecorationLine: "underline" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  accountBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
  },
  accountNumber: { color: colors.text, fontWeight: "800", fontFamily: "monospace" },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 6,
  },
  closeBtn: { alignItems: "center", paddingTop: 16 },
  resultPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 16,
  },
});
