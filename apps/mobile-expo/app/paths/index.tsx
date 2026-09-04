import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Sk } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { plural } from "../../lib/types";

export default function PathsIndex() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["learning-paths"],
    queryFn: api.learningPaths,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (isLoading) {
    return (
      <View style={[styles.loading, { paddingHorizontal: gutter }]}>
        {[0, 1, 2].map((i) => (
          <Sk key={i} style={styles.cardSk} />
        ))}
      </View>
    );
  }
  if (error) {
    return <Failed title="Could not load the learning paths" onRetry={() => refetch()} />;
  }

  const paths = data ?? [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      data={paths}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>Learning paths</Text>
          <Text style={styles.subtitle}>
            {paths.length === 0
              ? "Courses in the order they make sense in"
              : `${plural(paths.length, "path")} · courses in the order they make sense in`}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Empty
          icon="git-branch-outline"
          title="No paths yet"
          body="A path strings courses into an order worth following. The first ones are on the way."
          action={{ label: "Browse courses", href: "/browse" }}
        />
      }
      renderItem={({ item }) => (
        <Press
          style={styles.card}
          onPress={() => router.push(`/paths/${item.id}`)}
          accessibilityLabel={`${item.title}, ${plural(item.courseCount, "course")}`}
        >
          <View style={styles.strip}>
            {(item.courses ?? []).slice(0, 4).map((c, i) => {
              const thumb = cloudinaryUrl(c.thumbnailUrl ?? null, { width: 140, height: 90 });
              return thumb ? (
                <Image key={i} source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View key={i} style={[styles.thumb, styles.center]}>
                  <Ionicons name="school-outline" size={14} color={colors.dim} />
                </View>
              );
            })}
          </View>
          <Text style={styles.eyebrow}>LEARNING PATH</Text>
          <Text style={styles.name} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.description && (
            <Text style={styles.muted} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View style={styles.metaRow}>
            {/* Was a "★" text glyph, which Manrope has no star for — so it came
                from a fallback font, at that font's size and baseline. */}
            {item.totalVotes > 0 && (
              <>
                <Ionicons name="star" size={11} color={colors.star} />
                <Text style={styles.meta}>{item.ratingAvg.toFixed(1)}</Text>
                <Text style={styles.meta}>·</Text>
              </>
            )}
            <Text style={styles.meta}>{plural(item.courseCount, "course")}</Text>
            {item.totalVotes > 0 && (
              <>
                <Text style={styles.meta}>·</Text>
                <Text style={styles.meta}>{plural(item.totalVotes, "vote")}</Text>
              </>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.dim} style={styles.chev} />
          </View>
        </Press>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, gap: 14, paddingBottom: 40, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, paddingVertical: 16, gap: 14 },
  cardSk: { height: 168, borderRadius: radius.lg },
  center: { alignItems: "center", justifyContent: "center" },
  head: { marginBottom: 2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  strip: { flexDirection: "row", gap: 6, marginBottom: 11 },
  thumb: { width: 64, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  name: { color: colors.text, fontSize: 16.5, fontWeight: "700", lineHeight: 22, marginTop: 5 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9 },
  meta: { color: colors.muted, fontSize: 11.5 },
  chev: { marginLeft: "auto" },
});
