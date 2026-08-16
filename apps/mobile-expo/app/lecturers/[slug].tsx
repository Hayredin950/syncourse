import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import { formatDuration, type LecturerDetail } from "../../lib/types";
import { Stars } from "../../components/StarRating";

export default function LecturerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["lecturer", slug],
    queryFn: () => api.lecturerDetail(slug!),
  });

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this lecturer</Text>
      </View>
    );
  }

  const l: LecturerDetail = data;
  const knownFor = [...l.courses].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 6);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {l.photoUrl ? (
          <Image source={{ uri: l.photoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoText}>{l.name.charAt(0)}</Text>
          </View>
        )}
        <Text style={styles.name}>{l.name}</Text>
        {l.credentials ? <Text style={styles.credentials}>{l.credentials}</Text> : null}
        {l.bio ? <Text style={styles.bio}>{l.bio}</Text> : null}
      </View>

      <Text style={styles.heading}>Known for</Text>
      <View style={styles.grid}>
        {knownFor.map((c) => (
          <Link key={c.id} href={`/courses/${c.slug}`} style={styles.gridCard}>
            {c.thumbnailUrl ? (
              <Image source={{ uri: c.thumbnailUrl }} style={styles.gridThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.gridThumb, styles.gridFallback]}>
                <Text style={{ color: colors.dim }}>▶</Text>
              </View>
            )}
            <Text numberOfLines={2} style={styles.gridTitle}>
              {c.title}
            </Text>
          </Link>
        ))}
      </View>

      <Text style={styles.heading}>All courses · {l.courses.length}</Text>
      {l.courses.map((c) => (
        <Link key={c.id} href={`/courses/${c.slug}`} style={styles.row}>
          <View style={styles.thumb}>
            <Text style={{ color: colors.dim }}>▶</Text>
          </View>
          <View style={styles.rowBody}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {c.title}
            </Text>
            <Text style={styles.muted}>{formatDuration(c.durationMin)}</Text>
          </View>
          <Stars value={c.ratingAvg} />
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  header: { alignItems: "center", marginBottom: 20 },
  photo: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, marginBottom: 12 },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  photoText: { color: colors.text, fontSize: 40, fontWeight: "800" },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  credentials: { color: colors.accent, fontSize: 13, marginTop: 2, textAlign: "center" },
  bio: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  gridCard: { width: "30%", flexGrow: 1 },
  gridThumb: { width: "100%", aspectRatio: 2 / 3, borderRadius: 10, backgroundColor: colors.surface },
  gridFallback: { alignItems: "center", justifyContent: "center" },
  gridTitle: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 48,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
