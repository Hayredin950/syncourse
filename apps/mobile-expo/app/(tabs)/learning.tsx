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
import type { LibraryCourse } from "../../lib/types";

/**
 * A reader's library: downloaded, saved, liked.
 *
 * There is no "in progress" or "completed" here. Courses arrive whole as
 * Telegram archives, so there is no lesson-by-lesson position to report — the
 * honest facts are which courses you took and which you marked.
 *
 * The route keeps its `learning` name so deep links still resolve; only the
 * label changed.
 */
const EMPTY: Record<number, string> = {
  0: "Courses you download through the Telegram bot show up here.",
  1: "Tap the bookmark on a course to keep it here.",
  2: "Courses you like show up here.",
};

export default function LibraryScreen() {
  const [tab, setTab] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-library"],
    queryFn: api.myLibrary,
  });

  const tabs = [
    { label: "Downloaded", items: data?.downloaded ?? [] },
    { label: "Saved", items: data?.saved ?? [] },
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
        <Text style={styles.muted}>Sign in to see your library</Text>
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
        ListEmptyComponent={<Text style={styles.muted}>{EMPTY[tab]}</Text>}
        renderItem={({ item }) => <LibraryRow item={item} />}
      />
    </View>
  );
}

function LibraryRow({ item }: { item: LibraryCourse }) {
  const router = useRouter();
  const when = item.downloadedAt ?? item.savedAt ?? item.likedAt ?? null;
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
      <View style={styles.thumb}>
        <Text style={{ color: colors.dim, fontSize: 14 }}>{item.title.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>
          ★ {item.ratingAvg.toFixed(1)} · {item.level}
        </Text>
      </View>
      {when && (
        <Text style={styles.when}>
          {new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
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
  cardMeta: { color: colors.dim, fontSize: 11, marginTop: 3 },
  when: { color: colors.dim, fontSize: 10 },
});
