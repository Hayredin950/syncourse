import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import { formatDuration, type LecturerDetail } from "../../lib/types";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkProfile } from "../../components/Skeleton";
import { Stars } from "../../components/StarRating";
import { Text } from "../../components/Type";

export default function LecturerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["lecturer", slug],
    queryFn: () => api.lecturerDetail(slug!),
  });
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 5 : width >= 640 ? 4 : 3;
  const cardW = Math.floor((width - 32 - (cols - 1) * 12) / cols);

  // Error first. The other order — `isLoading || !data` — never reaches this
  // branch, because a failed query leaves `data` undefined too, so a dead slug
  // used to spin forever.
  if (error) return <Failed title="Could not load this lecturer" onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkProfile />;

  const l: LecturerDetail = data;
  const knownFor = [...l.courses].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 6);
  const courseCount = l.courses.length === 1 ? "1 course" : `${l.courses.length} courses`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Stack.Screen options={{ title: l.name }} />
      <View style={styles.header}>
        {l.photoUrl ? (
          <Image source={{ uri: cloudinaryUrl(l.photoUrl, { width: 192, height: 192 }) ?? undefined }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoText}>{l.name.charAt(0)}</Text>
          </View>
        )}
        <Text style={styles.name}>{l.name}</Text>
        {l.credentials ? <Text style={styles.credentials}>{l.credentials}</Text> : null}
        {l.bio ? <Text style={styles.bio}>{l.bio}</Text> : null}
      </View>

      {knownFor.length > 1 && (
        <>
          <Text style={styles.heading}>Known for</Text>
          <View style={styles.grid}>
            {knownFor.map((c) => (
              // asChild matters: a plain <Link> renders a <Text>, so every one of
              // these cards used to lay its image and title out as inline text.
              <Link key={c.id} href={`/courses/${c.slug}`} asChild>
                <Press style={{ width: cardW }} accessibilityLabel={c.title}>
                  {c.thumbnailUrl ? (
                    <Image
                      source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 300, height: 450 }) ?? undefined }}
                      style={[styles.gridThumb, { width: cardW, height: Math.round(cardW * 1.4) }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.gridThumb, styles.fallback, { width: cardW, height: Math.round(cardW * 1.4) }]}>
                      <Ionicons name="play" size={18} color={colors.dim} />
                    </View>
                  )}
                  <Text numberOfLines={2} style={styles.gridTitle}>
                    {c.title}
                  </Text>
                </Press>
              </Link>
            ))}
          </View>
        </>
      )}

      <Text style={styles.heading}>All courses · {courseCount}</Text>
      {l.courses.map((c) => (
        <Link key={c.id} href={`/courses/${c.slug}`} asChild>
          <Press style={styles.row} accessibilityLabel={c.title}>
            {c.thumbnailUrl ? (
              <Image source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 192, height: 144 }) ?? undefined }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.fallback]}>
                <Ionicons name="play" size={15} color={colors.dim} />
              </View>
            )}
            <View style={styles.rowBody}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {c.title}
              </Text>
              <Text style={styles.muted}>
                {[c.level, formatDuration(c.durationMin)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {c.ratingCount > 0 ? <Stars value={c.ratingAvg} /> : null}
            <Ionicons name="chevron-forward" size={15} color={colors.dim} />
          </Press>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 2 },
  header: { alignItems: "center", marginBottom: 22 },
  photo: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, marginBottom: 12 },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  photoText: { color: colors.text, fontSize: 40, fontWeight: "800" },
  name: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  credentials: { color: colors.accent, fontSize: 13, marginTop: 3, textAlign: "center" },
  bio: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 9 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 22 },
  gridThumb: { borderRadius: radius.md, backgroundColor: colors.surface },
  gridTitle: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  fallback: { alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 64, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
