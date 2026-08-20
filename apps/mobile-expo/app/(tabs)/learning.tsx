import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";
import type { MyLearningItem } from "../../lib/types";

export default function LearningScreen() {
  const [tab, setTab] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-learning"],
    queryFn: api.myLearning,
  });

  const tabs = [
    { label: "In progress", items: data?.inProgress ?? [] },
    { label: "Completed", items: data?.completed ?? [] },
    { label: "Wishlist", items: data?.watchlist ?? [] },
    { label: "Liked", items: data?.liked ?? [] },
  ];

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
        <Text style={styles.muted}>Sign in to see your learning</Text>
        <Link href="/auth" style={styles.signIn}>
          Sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabBar}>
        {tabs.map((t, i) => (
          <Text
            key={t.label}
            style={[styles.tab, tab === i && styles.tabActive]}
            onPress={() => setTab(i)}
          >
            {t.label} ({t.items.length})
          </Text>
        ))}
      </View>
      <FlatList
        data={tabs[tab].items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.muted}>Nothing here yet</Text>}
        renderItem={({ item }) => <LearningRow item={item} />}
      />
    </View>
  );
}

function LearningRow({ item }: { item: MyLearningItem }) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
      <View style={styles.thumb}>
        <Text style={{ color: colors.dim, fontSize: 14 }}>▶</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {item.title}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(item.progressPct, 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{item.progressPct}% complete</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: colors.muted, fontSize: 13 },
  signIn: { color: colors.accent, fontWeight: "700" },
  tabBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tabActive: { color: colors.accent },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  progressText: { color: colors.dim, fontSize: 11, marginTop: 3 },
});
