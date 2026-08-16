import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
import { colors } from "../lib/tokens";

export default function CirclesScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["circles"],
    queryFn: api.circlesActivity,
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
        <Text style={{ fontSize: 48 }}>👥</Text>
        <Text style={styles.muted}>Follow people to see what they are learning</Text>
      </View>
    );
  }

  const activity = data?.activity ?? [];
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={activity}
      keyExtractor={(a) => a.id}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>👥</Text>
          <Text style={styles.muted}>Follow people to see what they are learning</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.body}>
              <Text style={styles.name}>{item.userName}</Text> {item.verb}{" "}
              <Text style={styles.target}>{item.targetTitle}</Text>
            </Text>
            <Text style={styles.muted}>{item.createdAt}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.text, fontWeight: "700" },
  body: { color: colors.text, fontSize: 14 },
  name: { fontWeight: "700" },
  target: { color: colors.accent },
});
