import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";

export default function ChangelogScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["app-versions"],
    queryFn: api.appVersions,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const versions = data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>What's new</Text>
      <Text style={styles.subtitle}>
        You're on the latest build. Release notes for every version live here.
      </Text>

      {versions.length === 0 && (
        <Text style={styles.muted}>No changelog published yet.</Text>
      )}

      {versions.map((v, i) => (
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
          </View>
          <Text style={styles.date}>{new Date(v.releasedAt).toLocaleDateString()}</Text>
          <Text style={styles.changelog}>{v.changelogMd}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
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
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  latestText: { color: "#000", fontSize: 10, fontWeight: "800" },
  date: { color: colors.dim, fontSize: 11, marginTop: 8 },
  changelog: {
    color: "rgba(244,244,245,0.8)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
});
