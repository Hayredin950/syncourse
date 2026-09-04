import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../components/Empty";
import { Sk } from "../components/Skeleton";
import { Text } from "../components/Type";
import * as api from "../lib/api";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import { plural, type UserStats } from "../lib/types";

/**
 * What this reader has actually done, in bars.
 *
 * The error branch used to say "Sign in to see your stats" whatever went wrong,
 * so a dropped connection read as being signed out. A 401 is the only case that
 * means that, and the API says which it is.
 */
export default function StatsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (isLoading) {
    return (
      <View style={[styles.loading, { paddingHorizontal: gutter }]}>
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} style={styles.cardSk} />
        ))}
      </View>
    );
  }
  if (error || !data) {
    return (error as api.ApiError | null)?.status === 401 ? (
      <Empty
        icon="stats-chart-outline"
        title="Your stats live with your account"
        body="Sign in and this fills with what you have rated, downloaded and saved."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your stats" onRetry={() => refetch()} />
    );
  }

  const s: UserStats = data;
  const maxRating = Math.max(...s.ratingDistribution.map((r) => r.count), 1);
  const maxCat = Math.max(...s.categoryCounts.map((c) => c.count), 1);
  const maxTag = Math.max(...s.topTags.map((t) => t.count), 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Text style={styles.title}>Your stats</Text>
      <Text style={styles.lede}>
        {s.engagedTotal > 0
          ? `Drawn from ${plural(s.engagedTotal, "course")} you have rated, saved or downloaded.`
          : "Rate, save or download a course and this starts filling in."}
      </Text>

      <Section title="Your ratings">
        <BarRows
          rows={s.ratingDistribution.map((r) => ({
            label: plural(r.stars, "star"),
            count: r.count,
            max: maxRating,
          }))}
        />
      </Section>

      <Section title="Your learning rhythm">
        <Bars data={s.monthlyDownloads.map((d) => ({ key: d.month, count: d.count }))} kind="month" />
        <Text style={styles.caption}>Courses downloaded per month</Text>
      </Section>

      <Section title="Categories">
        <BarRows rows={s.categoryCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
      </Section>

      <Section title="Instructors">
        <BarRows rows={s.instructorCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
      </Section>

      <Section title="Languages">
        <BarRows rows={s.languageCounts.map((c) => ({ label: c.label, count: c.count, max: maxCat }))} />
      </Section>

      {s.topInstructors.length > 0 && (
        <Section title="Instructors you learn from most">
          <View style={styles.avatarGrid}>
            {s.topInstructors.map((i) => {
              const photo = cloudinaryUrl(i.photoUrl, { width: 104, height: 104 });
              return (
                <View key={i.name} style={styles.avatarCell}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatar} resizeMode="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.center]}>
                      <Text style={styles.avatarText}>{i.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.avatarName} numberOfLines={2}>
                    {i.name}
                  </Text>
                  <Text style={styles.muted}>{plural(i.count, "course")}</Text>
                </View>
              );
            })}
          </View>
        </Section>
      )}

      <Section title="What you learn">
        <PctRows rows={s.contentTypeBreakdown} />
      </Section>

      <Section title="By difficulty">
        <PctRows rows={s.difficultyBreakdown} />
      </Section>

      <Section title="Your week">
        <Bars data={s.yourWeek.map((d) => ({ key: d.day, count: d.count }))} kind="day" />
      </Section>

      <Section title="Saved over time">
        <Bars data={s.watchlistGrowth.map((d) => ({ key: d.month, count: d.count }))} kind="month" />
      </Section>

      <Section title="Top tags">
        <BarRows rows={s.topTags.map((t) => ({ label: t.label, count: t.count, max: maxTag }))} />
      </Section>

      {s.pathProgress.length > 0 && (
        <Section title="Path progress">
          {s.pathProgress.map((p) => (
            <View key={p.id} style={styles.pathRow}>
              <View style={styles.grow}>
                <Text style={styles.pathTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, p.pct))}%` }]} />
                </View>
              </View>
              <Text style={styles.muted}>
                {p.pct}% · {p.downloaded}/{p.total}
              </Text>
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

/** The nothing-yet line every panel shares, kept short enough to sit in a card. */
function Nothing() {
  return (
    <View style={styles.nothing}>
      <Ionicons name="analytics-outline" size={15} color={colors.dim} />
      <Text style={styles.muted}>Fills in as you learn.</Text>
    </View>
  );
}

function BarRows({ rows }: { rows: { label: string; count: number; max: number }[] }) {
  if (rows.length === 0) return <Nothing />;
  return (
    <View style={styles.rows}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.max((r.count / Math.max(r.max, 1)) * 100, r.count > 0 ? 4 : 0)}%` },
              ]}
            />
          </View>
          <Text style={styles.barCount}>{r.count.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

function PctRows({ rows }: { rows: { label: string; count: number; pct: number }[] }) {
  if (rows.length === 0) return <Nothing />;
  return (
    <View style={styles.rows}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, r.pct))}%` }]} />
          </View>
          <Text style={styles.barCount}>{r.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A column chart. The axis printed `"2026-09".slice(5)` — so "09" for a month and
 * "09-01" for a day — which is a date fragment rather than a label.
 */
function Bars({ data, kind }: { data: { key: string; count: number }[]; kind: "month" | "day" }) {
  if (data.length === 0) return <Nothing />;
  const max = Math.max(...data.map((d) => d.count), 1);
  const label = (key: string) => {
    const d = new Date(kind === "month" ? `${key}-01T00:00:00` : `${key}T00:00:00`);
    if (Number.isNaN(d.getTime())) return key;
    return kind === "month"
      ? d.toLocaleDateString(undefined, { month: "short" })
      : d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
  };
  return (
    <View style={styles.bars}>
      {data.map((d) => (
        <View key={d.key} style={styles.barCol}>
          <Text style={styles.barValue}>{d.count > 0 ? d.count : ""}</Text>
          <View
            style={[
              styles.colBar,
              d.count === 0 && styles.colBarEmpty,
              { height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 3)}%` },
            ]}
          />
          <Text style={styles.colLabel} numberOfLines={1}>
            {label(d.key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 50 },
  loading: { flex: 1, backgroundColor: colors.bg, paddingVertical: 16, gap: 14 },
  cardSk: { height: 128, borderRadius: radius.md },
  center: { alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
  muted: { color: colors.muted, fontSize: 11.5 },
  caption: { color: colors.dim, fontSize: 11, marginTop: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  lede: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  section: { marginTop: 20 },
  sectionTitle: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  nothing: { flexDirection: "row", alignItems: "center", gap: 8 },
  rows: { gap: 9 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  barLabel: { color: colors.body, fontSize: 12, width: 104 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  barCount: { color: colors.muted, fontSize: 11, width: 38, textAlign: "right" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 108 },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" },
  barValue: { color: colors.dim, fontSize: 9, marginBottom: 3 },
  colBar: { width: "100%", borderRadius: 3, backgroundColor: colors.accent },
  colBarEmpty: { backgroundColor: colors.surfaceRaised },
  colLabel: { color: colors.muted, fontSize: 9, marginTop: 5 },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  avatarCell: { alignItems: "center", width: 68, gap: 3 },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  avatarText: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  avatarName: { color: colors.text, fontSize: 11, fontWeight: "600", marginTop: 3, textAlign: "center" },
  pathRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  pathTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden", marginTop: 6 },
  fill: { height: "100%", backgroundColor: colors.accent },
});
