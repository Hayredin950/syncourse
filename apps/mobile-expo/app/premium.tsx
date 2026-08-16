import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
import { colors } from "../lib/tokens";

export default function PremiumScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["plans"], queryFn: api.plans });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Every course.{"\n"}Full speed. No ads.</Text>

      <Benefit icon="⚡" title="Stream instantly" desc="No queues, no limits on playback quality" />
      <Benefit icon="⬇" title="Full-speed downloads" desc="Offline lessons with a quality picker" />
      <Benefit icon="🚫" title="Zero ads" desc="An ad-free experience across web and app" />

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        (data ?? []).map((plan) => (
          <View
            key={plan.id}
            style={[styles.plan, plan.isBestValue && styles.planBest]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                {plan.isBestValue && (
                  <View style={styles.bestBadge}>
                    <Text style={styles.bestText}>BEST VALUE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.muted}>~{plan.weeklyEtb} ETB/week</Text>
            </View>
            <Text style={styles.planPrice}>{plan.priceEtb} ETB</Text>
          </View>
        ))
      )}

      <Text style={styles.payNote}>
        Payment methods: Telebirr · Card · Crypto (USDT/BTC/ETH/SOL) · Patreon
      </Text>
      <Text style={styles.payNote}>
        Subscribe on the web (syncourse.com/premium), then sign in here — your plan syncs instantly.
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
  content: { padding: 24, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, lineHeight: 34, marginBottom: 24 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  planBest: { borderWidth: 2, borderColor: colors.accent },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  bestBadge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bestText: { color: "#000", fontSize: 10, fontWeight: "800" },
  planPrice: { color: colors.text, fontSize: 20, fontWeight: "800" },
  payNote: { color: colors.dim, fontSize: 12, textAlign: "center", marginTop: 10 },
});
