import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
  });

  const readMut = useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const items = data?.notifications ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Notifications</Text>
        {data && data.unread > 0 && (
          <Pressable style={styles.readAll} onPress={() => readMut.mutate()}>
            <Text style={styles.readAllLabel}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 && (
        <Text style={styles.empty}>
          No notifications yet. Reminders about your courses and Telegram
          updates will appear here.
        </Text>
      )}

      {items.map((n) => (
        <View key={n.id} style={[styles.card, !n.read && styles.unread]}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>
              {n.type === "telegram_reminder" ? "✈️ " : "🔔 "}
              {n.title}
            </Text>
            {!n.read && <View style={styles.dot} />}
          </View>
          <Text style={styles.cardBody}>{n.body}</Text>
          <Text style={styles.date}>
            {new Date(n.createdAt).toLocaleString()}
          </Text>
          {n.deepLink && (
            <Link href={n.deepLink as any} style={styles.link}>
              Open →
            </Link>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  readAll: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readAllLabel: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  empty: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 40, lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  unread: { borderColor: colors.accent },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  cardBody: { color: "rgba(244,244,245,0.75)", fontSize: 13, marginTop: 4, lineHeight: 18 },
  date: { color: colors.dim, fontSize: 11, marginTop: 8 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "600", marginTop: 8 },
});
