import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";

export default function ListsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-lists"],
    queryFn: api.myLists,
  });

  const createMut = useMutation({
    mutationFn: api.createList,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-lists"] }),
  });

  const promptCreate = () => {
    Alert.prompt("New list", "List name", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Create",
        onPress: (name?: string) => {
          if (name?.trim()) createMut.mutate(name.trim());
        },
      },
    ]);
  };

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
        <Text style={styles.muted}>Sign in to see your lists</Text>
        <Link href="/auth" style={styles.signIn}>
          Sign in
        </Link>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data ?? []}
      keyExtractor={(l) => l.id}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.muted}>No lists yet — tap + to create one</Text>
        </View>
      }
      ListHeaderComponent={
        <Text style={styles.addBtn} onPress={promptCreate}>
          + New list
        </Text>
      }
      renderItem={({ item }) => (
        <Link href={`/lists/${item.id}`} asChild>
          <View style={styles.card}>
            <Text style={{ fontSize: 18 }}>{item.visibility === "public" ? "🌐" : "🔒"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.itemCount} courses · {item.visibility}
              </Text>
            </View>
            <Text style={{ color: colors.dim }}>›</Text>
          </View>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  signIn: { color: colors.accent, fontWeight: "700" },
  addBtn: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "right",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
