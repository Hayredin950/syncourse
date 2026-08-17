import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";

export default function PathDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["learning-path", id],
    queryFn: () => api.learningPath(id as string),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Learning path not found.</Text>
        <Link href="/paths" style={styles.link}>All learning paths</Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Hero */}
      {data.coverUrl ? (
        <Image
          source={{ uri: cloudinaryUrl(data.coverUrl, { width: 800, height: 360 }) ?? undefined }}
          style={styles.hero}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.hero, styles.heroFallback]} />
      )}
      <Text style={styles.eyebrow}>LEARNING PATH · {data.courseCount} COURSES</Text>
      <Text style={styles.title}>{data.title}</Text>
      {!!data.description && <Text style={styles.desc}>{data.description}</Text>}
      <Text style={styles.meta}>
        ★ {data.ratingAvg.toFixed(1)} avg · {data.totalVotes.toLocaleString()} votes
      </Text>

      {/* Course list */}
      <Text style={styles.sectionTitle}>Courses in this path</Text>
      {data.courses.map((c, i) => (
        <Link key={c.id} href={`/courses/${c.slug}`} asChild>
          <View style={styles.row}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
              <Text style={styles.rowMeta}>
                {c.level} · ★ {c.ratingAvg.toFixed(1)} · {formatMin(c.durationMin)}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Link>
      ))}
    </ScrollView>
  );
}

function formatMin(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 8 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  hero: { width: "100%", height: 170, borderRadius: radius.lg, marginBottom: 14 },
  heroFallback: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 6 },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  rank: {
    minWidth: 24,
    textAlign: "center",
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800",
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  chevron: { color: colors.dim, fontSize: 20 },
  muted: { color: colors.muted, fontSize: 13 },
});
