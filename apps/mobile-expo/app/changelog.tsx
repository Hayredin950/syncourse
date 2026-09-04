import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../components/Empty";
import { Markdown } from "../components/Markdown";
import { Press } from "../components/Press";
import { Sk } from "../components/Skeleton";
import { Text } from "../components/Type";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { applyUpdate, compareVersions, getInstalledVersion } from "../lib/update";

/**
 * Release notes, newest first.
 *
 * The notes are authored as Markdown and were printed as one raw string, so a
 * list arrived as "- " and a heading as "## ". They go through the same renderer
 * the legal documents use now.
 */
export default function ChangelogScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["app-versions"],
    queryFn: api.appVersions,
  });
  const [updating, setUpdating] = useState(false);
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const versions = data ?? [];
  const installed = getInstalledVersion();
  const latest = versions.length > 0 ? versions[0] : null;
  const updateAvailable = !!latest && compareVersions(latest.version, installed) > 0;

  const onUpdate = async () => {
    setUpdating(true);
    try {
      await applyUpdate();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Text style={styles.title}>What's new</Text>
      <Text style={styles.subtitle}>
        You're on v{installed}. Release notes for every version live here.
      </Text>

      {updateAvailable && (
        <View style={styles.ctaCard}>
          <View style={styles.ctaIcon}>
            <Ionicons name="arrow-down-circle" size={20} color={colors.accent} />
          </View>
          <View style={styles.ctaCopy}>
            <Text style={styles.ctaTitle}>v{latest?.version} is available</Text>
            <Text style={styles.ctaSub}>Update now to get the latest fixes and features.</Text>
          </View>
          {/* Was a spinner swapped in for the label, which changed the button's
              width mid-press. */}
          <Press
            style={styles.ctaBtn}
            onPress={onUpdate}
            disabled={updating}
            haptic="success"
            accessibilityLabel={`Update to version ${latest?.version}`}
          >
            <Text style={styles.ctaBtnText}>{updating ? "Updating…" : "Update"}</Text>
          </Press>
        </View>
      )}

      {isLoading ? (
        // Was a centred spinner on an otherwise empty screen, which says nothing
        // about what is coming.
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <Sk key={i} style={styles.cardSk} />
          ))}
        </View>
      ) : error ? (
        <Failed title="Could not load the changelog" onRetry={() => refetch()} />
      ) : versions.length === 0 ? (
        <Empty
          icon="sparkles-outline"
          title="No changelog yet"
          body="Release notes land here the moment a new version ships."
        />
      ) : (
        versions.map((v, i) => (
          <View key={v.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>v{v.version}</Text>
              </View>
              {i === 0 && (
                <View style={styles.latestBadge}>
                  <Text style={styles.latestText}>LATEST</Text>
                </View>
              )}
              {v.version === installed && (
                <View style={styles.youBadge}>
                  <Ionicons name="checkmark" size={11} color={colors.success} />
                  <Text style={styles.youText}>Installed</Text>
                </View>
              )}
              <Text style={styles.date}>
                {new Date(v.releasedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
            <Markdown text={v.changelogMd} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },
  skeletons: { gap: 12 },
  cardSk: { height: 132, borderRadius: radius.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  versionBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  latestBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  latestText: { color: colors.onAccent, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  youBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: colors.surfaceRaised,
  },
  youText: { color: colors.success, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  date: { color: colors.dim, fontSize: 11, marginLeft: "auto" },
  ctaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 16,
  },
  ctaIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  ctaCopy: { flex: 1, gap: 2 },
  ctaTitle: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  ctaSub: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  ctaBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 42,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
});
