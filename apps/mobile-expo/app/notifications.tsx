import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../components/Empty";
import { Press } from "../components/Press";
import { SkRows } from "../components/Skeleton";
import { Text } from "../components/Type";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { plural } from "../lib/types";

/**
 * Was "✈️ " or "🔔 " glued to the front of the title — two glyphs from two fonts,
 * on two different baselines, that a screen reader reads aloud as "airplane".
 */
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  legal_update: "document-text",
  telegram_reminder: "paper-plane",
  system: "megaphone",
};
const iconFor = (type: string) => ICON[type] ?? "notifications";

/** "just now" up to a week, then the date. `toLocaleString()` printed both. */
function formatWhen(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${plural(days, "day")} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const readMut = useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={5} thumb={38} />
      </View>
    );
  }
  if (error) {
    return (error as api.ApiError).status === 401 ? (
      <Empty
        icon="person-circle-outline"
        title="Notifications live with your account"
        body="Sign in to see reminders about your courses and the documents you need to accept."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your notifications" onRetry={() => refetch()} />
    );
  }

  const items = data?.notifications ?? [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.topRow}>
          <View style={styles.grow}>
            <Text style={styles.title}>Notifications</Text>
            {!!data && data.unread > 0 && (
              <Text style={styles.unreadCount}>{plural(data.unread, "unread", "unread")}</Text>
            )}
          </View>
          {!!data && data.unread > 0 && (
            <Press
              style={styles.readAll}
              onPress={() => readMut.mutate()}
              disabled={readMut.isPending}
              haptic
              accessibilityLabel="Mark all notifications read"
            >
              <Ionicons name="checkmark-done" size={15} color={colors.accent} />
              <Text style={styles.readAllLabel}>{readMut.isPending ? "Marking…" : "Mark all read"}</Text>
            </Press>
          )}
        </View>
      }
      ListEmptyComponent={
        <Empty
          icon="notifications-outline"
          title="Nothing to catch up on"
          body="Reminders about your courses, and any document that needs re-accepting, land here."
        />
      }
      renderItem={({ item }) => (
        <View style={[styles.card, !item.read && styles.unread]}>
          <View style={styles.cardTop}>
            <View style={[styles.icon, !item.read && styles.iconOn]}>
              <Ionicons
                name={iconFor(item.type)}
                size={16}
                color={item.read ? colors.muted : colors.accent}
              />
            </View>
            <View style={styles.grow}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.date}>{formatWhen(item.createdAt)}</Text>
            </View>
            {!item.read && <View style={styles.dot} />}
          </View>
          <Text style={styles.cardBody}>{item.body}</Text>
          {/* Was a bare "Open →" text link: 13px of type for a tap target. */}
          {!!item.deepLink && (
            <Press
              style={styles.open}
              onPress={() => router.push(item.deepLink as never)}
              accessibilityLabel={`Open: ${item.title}`}
            >
              <Text style={styles.openLabel}>Open</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
            </Press>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, gap: 10, paddingBottom: 40, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  grow: { flex: 1, gap: 3 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  unreadCount: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  readAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  readAllLabel: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  card: {
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.accent },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  iconOn: { backgroundColor: colors.accentSoft },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  cardBody: { color: colors.body, fontSize: 13, lineHeight: 19 },
  date: { color: colors.dim, fontSize: 11 },
  open: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  openLabel: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
});
