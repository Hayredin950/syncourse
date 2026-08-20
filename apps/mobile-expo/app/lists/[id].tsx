import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View, Pressable } from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["list", id],
    queryFn: () => api.listDetail(id!),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this list</Text>
      </View>
    );
  }

  const list = data;
  const items = list.items ?? [];
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Text style={styles.heading}>
          {list.name} · {list.itemCount} courses
        </Text>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>Nothing here. This collection is empty.</Text>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
          <View style={styles.thumb}>
            <Text style={{ color: colors.dim, fontSize: 14 }}>▶</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {item.title}
            </Text>
            <Text style={styles.muted}>{item.progressPct}% · {item.status}</Text>
          </View>
          <Text style={{ color: colors.dim }}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  heading: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
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
});
