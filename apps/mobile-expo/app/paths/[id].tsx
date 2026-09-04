import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Sk, SkRows } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { formatDuration, plural } from "../../lib/types";

/**
 * One learning path: the cover, what it is for, and its courses in order.
 *
 * The order is the whole point of a path, so the rank stays a numbered chip
 * rather than the bullet it may as well have been.
 */
export default function PathDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["learning-path", id],
    queryFn: () => api.learningPath(id as string),
    enabled: !!id,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (isLoading) {
    return (
      <View style={[styles.loading, { paddingHorizontal: gutter }]}>
        <Sk style={styles.heroSk} />
        <SkRows n={5} thumb={40} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <Failed
        title="Could not open this path"
        body={(error as Error | null)?.message || "It may have been unpublished."}
        onRetry={() => refetch()}
      />
    );
  }

  const cover = cloudinaryUrl(data.coverUrl, { width: 800, height: 360 });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Stack.Screen options={{ title: data.title }} />
      {cover ? (
        <Image source={{ uri: cover }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={[styles.hero, styles.heroFallback]}>
          <Ionicons name="git-branch-outline" size={26} color={colors.dim} />
        </View>
      )}
      <Text style={styles.eyebrow}>LEARNING PATH</Text>
      <Text style={styles.title}>{data.title}</Text>
      {!!data.description && <Text style={styles.desc}>{data.description}</Text>}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{plural(data.courseCount, "course")}</Text>
        {/* The rating block used to print "★ 0.0 avg · 0 votes" on every unrated path. */}
        {data.totalVotes > 0 && (
          <>
            <Text style={styles.meta}>·</Text>
            <Ionicons name="star" size={12} color={colors.star} />
            <Text style={styles.meta}>
              {data.ratingAvg.toFixed(1)} from {plural(data.totalVotes, "vote")}
            </Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Courses in this path</Text>
      {data.courses.map((c, i) => {
        const thumb = cloudinaryUrl(c.thumbnailUrl, { width: 120, height: 168 });
        const meta = [c.level, c.ratingCount > 0 ? c.ratingAvg.toFixed(1) : null, formatDuration(c.durationMin)]
          .filter(Boolean)
          .join(" · ");
        return (
          <Press
            key={c.id}
            style={styles.row}
            onPress={() => router.push(`/courses/${c.slug}`)}
            accessibilityLabel={`${i + 1}. ${c.title}. ${meta}`}
          >
            <View style={styles.rankChip}>
              <Text style={styles.rank}>{i + 1}</Text>
            </View>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.center]}>
                <Ionicons name="school-outline" size={15} color={colors.dim} />
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {c.title}
              </Text>
              <Text style={styles.rowMeta}>{meta}</Text>
            </View>
            {/* Was a "›" glyph at 20px, on a different baseline per platform. */}
            <Ionicons name="chevron-forward" size={17} color={colors.dim} />
          </Press>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: colors.bg, paddingVertical: 16, gap: 14 },
  heroSk: { width: "100%", height: 170, borderRadius: radius.lg },
  center: { alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", height: 170, borderRadius: radius.lg, marginBottom: 14 },
  heroFallback: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 },
  desc: { color: colors.body, fontSize: 13.5, lineHeight: 20, marginTop: 9 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, flexWrap: "wrap" },
  meta: { color: colors.muted, fontSize: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rankChip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  rank: { color: colors.accent, fontSize: 12.5, fontWeight: "800" },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  rowMeta: { color: colors.muted, fontSize: 11.5 },
});
