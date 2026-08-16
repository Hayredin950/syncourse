import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { LearningPath } from "../lib/types";
import { Stars } from "../components/StarRating";

export default function PathsScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["learning-paths"],
    queryFn: api.learningPaths,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load learning paths</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={data ?? []}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={<Text style={styles.muted}>No learning paths yet</Text>}
      renderItem={({ item }) => <PathCard path={item} />}
    />
  );
}

function PathCard({ path }: { path: LearningPath }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{path.title}</Text>
        <Stars value={path.ratingAvg} />
      </View>
      {path.description ? <Text style={styles.desc}>{path.description}</Text> : null}
      <Text style={styles.muted}>
        {path.courseCount} courses · {path.totalVotes.toLocaleString()} votes
      </Text>
      <View style={styles.courseList}>
        {path.courses.map((c, i) => (
          <Link key={c.id} href={`/courses/${c.slug}`} style={styles.courseRow}>
            <Text style={styles.courseNum}>{i + 1}</Text>
            <Text numberOfLines={1} style={styles.courseTitle}>
              {c.title}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Link>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1, marginRight: 8 },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  courseList: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6 },
  courseRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  courseNum: { color: colors.dim, fontSize: 12, width: 18 },
  courseTitle: { color: colors.text, fontSize: 13, flex: 1 },
  chevron: { color: colors.dim },
});
