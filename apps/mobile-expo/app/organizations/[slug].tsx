import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";
import { formatDuration, type OrganizationDetail } from "../../lib/types";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { Stars } from "../../components/StarRating";

export default function OrganizationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["organization", slug],
    queryFn: () => api.organizationDetail(slug!),
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
        <Text style={styles.muted}>Could not load this organization</Text>
      </View>
    );
  }

  const o: OrganizationDetail = data;
  const typeLabel =
    (o as any).orgType === "university" ? "UNIVERSITY" : (o as any).orgType === "company" ? "COMPANY" : "PUBLISHER";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {o.logoUrl ? (
          <Image source={{ uri: cloudinaryUrl(o.logoUrl, { width: 160, height: 160 }) ?? undefined }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoText}>{o.name.charAt(0)}</Text>
          </View>
        )}
        <Text style={styles.name}>{o.name}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{typeLabel}</Text>
        </View>
        {o.description ? <Text style={styles.bio}>{o.description}</Text> : null}
        <Text style={styles.muted}>
          {o.subscribers?.toLocaleString() ?? 0} subscribers · {o.courses.length} courses
        </Text>
      </View>

      <Text style={styles.heading}>Catalog · {o.courses.length} courses</Text>
      {o.courses.map((c) => (
        <Link key={c.id} href={`/courses/${c.slug}`} style={styles.row}>
          {c.thumbnailUrl ? (
            <Image source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 96, height: 72 }) ?? undefined }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Text style={{ color: colors.dim }}>▶</Text>
            </View>
          )}
          <View style={styles.rowBody}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {c.title}
            </Text>
            <Text style={styles.muted}>
              {c.level} · {formatDuration(c.durationMin)}
            </Text>
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
  logo: { width: 80, height: 80, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 12 },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoText: { color: colors.text, fontSize: 34, fontWeight: "800" },
  name: { color: colors.text, fontSize: 22, fontWeight: "800" },
  typeBadge: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: 6,
    backgroundColor: colors.accentSoft,
  },
  typeText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  bio: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
