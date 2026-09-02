import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { UserStats } from "../lib/types";

export default function StatsScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to see your stats</Text>
        <Link href="/auth" style={styles.signIn}>Sign in</Link>
      </View>
    );
  }

  const s: UserStats = data;
  const maxRating = Math.max(...s.ratingDistribution.map((r) => r.count), 1);
  const maxCat = Math.max(...s.categoryCounts.map((c) => c.count), 1);
  const maxTag = Math.max(...s.topTags.map((t) => t.count), 1);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your stats</Text>

      <Section title="Your ratings">
        <BarRows rows={s.ratingDistribution.map((r) => ({ label: `${r.stars}★`, count: r.count, max: maxRating }))} />
      </Section>

      <Section title="Your learning rhythm">
        <MonthBars data={s.monthlyDownloads} />
        <Text style={styles.muted}>Courses downloaded per month</Text>
      </Section>

      <Section title="Categories · Instructors · Languages">
        <Text style={styles.sub}>Categories</Text>
        <BarRows rows={s.categoryCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
        <Text style={styles.sub}>Instructors</Text>
        <BarRows rows={s.instructorCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
        <Text style={styles.sub}>Languages</Text>
        <BarRows rows={s.languageCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
      </Section>

      {s.topInstructors.length > 0 && (
        <Section title="Instructors you learn from most">
          <View style={styles.avatarGrid}>
            {s.topInstructors.map((i) => (
              <View key={i.name} style={styles.avatarCell}>
                {i.photoUrl ? (
                  <Image source={{ uri: i.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{i.name.charAt(0)}</Text>
                  </View>
                )}
                <Text style={styles.avatarName} numberOfLines={1}>{i.name}</Text>
                <Text style={styles.muted}>{i.count} courses</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      <Section title="What you learn (by type)">
        <PctRows rows={s.contentTypeBreakdown} />
      </Section>

      <Section title="By difficulty">
        <PctRows rows={s.difficultyBreakdown} />
      </Section>

      <Section title="Your week">
        <MonthBars data={s.yourWeek.map((d) => ({ month: d.day, count: d.count }))} />
      </Section>

      <Section title="Saved over time">
        <MonthBars data={s.watchlistGrowth} />
      </Section>

      <Section title="Top tags">
        <BarRows rows={s.topTags.map((t) => ({ label: t.label, count: t.count, max: maxTag }))} />
      </Section>

      {s.pathProgress.length > 0 && (
        <Section title="Path progress">
          {s.pathProgress.map((p) => (
            <View key={p.id} style={styles.pathRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pathTitle} numberOfLines={1}>{p.title}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${p.pct}%` }]} />
                </View>
              </View>
              <Text style={styles.muted}>{p.pct}% · {p.downloaded}/{p.total}</Text>
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function BarRows({ rows }: { rows: { label: string; count: number; max: number }[] }) {
  if (rows.length === 0) {
    return <Text style={styles.muted}>Fills in as you learn — nothing here yet.</Text>;
  }
  return (
    <View style={{ gap: 7 }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max((r.count / Math.max(r.max, 1)) * 100, r.count > 0 ? 4 : 2)}%` }]} />
          </View>
          <Text style={styles.barCount}>{r.count}</Text>
        </View>
      ))}
    </View>
  );
}

function PctRows({ rows }: { rows: { label: string; count: number; pct: number }[] }) {
  if (rows.length === 0) {
    return <Text style={styles.muted}>Fills in as you learn — nothing here yet.</Text>;
  }
  return (
    <View style={{ gap: 7 }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${r.pct}%` }]} />
          </View>
          <Text style={styles.barCount}>{r.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

function MonthBars({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  if (data.length === 0) {
    return <Text style={styles.muted}>Fills in as you learn — nothing here yet.</Text>;
  }
  return (
    <View style={styles.monthBars}>
      {data.map((d) => (
        <View key={d.month} style={styles.mbCol}>
          <View
            style={[styles.mbBar, d.count === 0 && styles.mbBarEmpty, { height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 3)}%` }]}
          />
          <Text style={styles.mbLabel} numberOfLines={1}>{d.month.slice(5)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 50 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: colors.muted, fontSize: 12 },
  signIn: { color: colors.accent, fontWeight: "700" },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 6 },
  section: { marginTop: 18 },
  sectionTitle: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  sub: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { color: colors.text, fontSize: 12, width: 110 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  barCount: { color: colors.muted, fontSize: 11, width: 34, textAlign: "right" },
  monthBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 90 },
  mbCol: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" },
  mbBar: { width: "100%", borderRadius: 3, backgroundColor: colors.accent },
  mbBarEmpty: { backgroundColor: colors.surfaceRaised },
  mbLabel: { color: colors.muted, fontSize: 8, marginTop: 4 },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  avatarCell: { alignItems: "center", width: 64 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceRaised },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  avatarName: { color: colors.text, fontSize: 11, fontWeight: "600", marginTop: 4, textAlign: "center" },
  pathRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  pathTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden", marginTop: 5 },
  fill: { height: "100%", backgroundColor: colors.accent },
});
