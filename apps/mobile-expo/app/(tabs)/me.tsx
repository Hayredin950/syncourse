import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/tokens";

export default function MeScreen() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.dim, fontSize: 52 }}>👤</Text>
        <Text style={styles.muted}>Sign in to sync your learning across devices</Text>
        <Link href="/auth" style={styles.signIn}>
          Sign in / Create account
        </Link>
      </View>
    );
  }

  const stats = [
    { label: "Enrolled", value: user.stats.enrolled },
    { label: "Completed", value: user.stats.completed },
    { label: "Saved", value: user.stats.saved },
    { label: "Liked", value: user.stats.liked },
    { label: "Lists", value: user.stats.lists },
    { label: "Reviews", value: user.stats.reviews },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={{ width: 62, height: 62, borderRadius: 31 }} />
          ) : (
            <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.username}>
            @{user.username} · member since {new Date(user.memberSince).getFullYear()}
          </Text>
          {user.planType === "premium" && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.statGrid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <MenuRow icon="list" label="My lists" href="/lists" />
      <MenuRow icon="chart" label="Stats" href="/stats" />
      <MenuRow icon="path" label="Learning paths" href="/paths" />
      <MenuRow icon="download" label="Downloads" href="/downloads" />
      <MenuRow icon="bell" label="Notifications" href="/notifications" />
      <MenuRow icon="ribbon" label="Subscription" href="/premium" />
      <MenuRow icon="people" label="Circles" href="/circles" />
      <MenuRow icon="sparkles" label="What's new" href="/changelog" />
      <MenuRow icon="settings" label="Settings" href="/settings" />

      <Text
        style={styles.signOut}
        onPress={async () => {
          await signOut();
          router.replace("/");
        }}
      >
        Sign out
      </Text>
    </ScrollView>
  );
}

function MenuRow({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} asChild>
      <View style={styles.menuRow}>
        <Text style={{ color: colors.accent, fontSize: 18 }}>{icon}</Text>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={{ color: colors.dim }}>›</Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  signIn: { color: colors.accent, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.text, fontSize: 26, fontWeight: "800" },
  name: { color: colors.text, fontSize: 20, fontWeight: "800" },
  username: { color: colors.muted, fontSize: 12 },
  premiumBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  premiumText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  stat: {
    width: "31%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLabel: { color: colors.text, fontSize: 14, flex: 1 },
  signOut: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 24,
    textAlign: "center",
  },
});
