import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import { formatDuration, type OrganizationDetail } from "../../lib/types";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkProfile } from "../../components/Skeleton";
import { Stars } from "../../components/StarRating";
import { Text } from "../../components/Type";

export default function OrganizationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["organization", slug],
    queryFn: () => api.organizationDetail(slug!),
  });

  // Error first: with `isLoading || !data` ahead of it this branch was dead, so
  // a dead slug spun forever.
  if (error) return <Failed title="Could not load this channel" onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkProfile />;

  const o: OrganizationDetail = data;
  const orgType = (o as { orgType?: string }).orgType;
  const typeLabel = orgType === "university" ? "UNIVERSITY" : orgType === "company" ? "COMPANY" : "PUBLISHER";
  const n = o.courses.length;
  const courseCount = n === 1 ? "1 course" : `${n} courses`;
  const subs = o.subscribers ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Stack.Screen options={{ title: o.name }} />
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
        {/* A brand-new channel has no subscribers and printing "0 subscribers"
            under its name is a worse first impression than saying nothing. */}
        <Text style={styles.metaLine}>
          {[subs > 0 ? `${subs.toLocaleString()} subscriber${subs === 1 ? "" : "s"}` : null, courseCount]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <Text style={styles.heading}>Catalogue · {courseCount}</Text>
      {o.courses.map((c) => (
        // asChild: <Link> renders a <Text> by default, which flattened each of
        // these rows into inline text instead of a thumbnail beside a title.
        <Link key={c.id} href={`/courses/${c.slug}`} asChild>
          <Press style={styles.row} accessibilityLabel={c.title}>
            {c.thumbnailUrl ? (
              <Image source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 192, height: 144 }) ?? undefined }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
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
  metaLine: { color: colors.muted, fontSize: 12, marginTop: 10 },
  header: { alignItems: "center", marginBottom: 22 },
  logo: { width: 80, height: 80, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: 12 },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoText: { color: colors.text, fontSize: 34, fontWeight: "800" },
  name: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  typeBadge: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: 8,
    backgroundColor: colors.accentSoft,
  },
  typeText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  bio: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 10 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 64, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
