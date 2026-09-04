import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkProfile } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { useAuth } from "../../lib/auth";
import { colors, radius } from "../../lib/tokens";

/**
 * The account hub.
 *
 * Ten menu rows used to sit in one undifferentiated hairline-separated stack, so
 * finding Settings meant reading all ten. They are grouped now — what you have
 * learned, who you learn with, and the account itself.
 */
type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; href: string; hint?: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Your learning",
    rows: [
      { icon: "albums-outline", label: "My lists", href: "/lists", hint: "Collections you keep" },
      { icon: "cloud-download-outline", label: "Downloads", href: "/downloads", hint: "Everything you have taken" },
      { icon: "git-branch-outline", label: "Learning paths", href: "/paths", hint: "Courses in a sensible order" },
      { icon: "stats-chart-outline", label: "Your stats", href: "/stats", hint: "What you have actually done" },
    ],
  },
  {
    title: "Around Syncourse",
    rows: [
      { icon: "people-outline", label: "Circles", href: "/circles", hint: "Groups and what they are reading" },
      { icon: "document-text-outline", label: "Resources", href: "/browse?tab=resources", hint: "Cheat-sheets, roadmaps, notes" },
      { icon: "sparkles-outline", label: "What's new", href: "/changelog", hint: "Every release, newest first" },
    ],
  },
  {
    title: "Account",
    rows: [
      { icon: "ribbon-outline", label: "Subscription", href: "/premium" },
      { icon: "notifications-outline", label: "Notifications", href: "/notifications" },
      { icon: "settings-outline", label: "Settings", href: "/settings" },
    ],
  },
];

export default function MeScreen() {
  const { user, loading, signOut, refresh } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (loading) return <SkProfile rows={6} />;

  if (!user) {
    // Was a 52px "👤" and a bare text link, which is not a tap target.
    return (
      <Empty
        icon="person-circle-outline"
        title="Sign in to make it yours"
        body="An account keeps your downloads, lists and ratings together on every device you read on."
        action={{ label: "Sign in or create an account", href: "/auth" }}
      />
    );
  }

  const avatar = cloudinaryUrl(user.avatarUrl, { width: 160, height: 160 });
  const stats = [
    { label: "Downloaded", value: user.stats.downloaded },
    { label: "Saved", value: user.stats.saved },
    { label: "Liked", value: user.stats.liked },
    { label: "Lists", value: user.stats.lists },
    { label: "Reviews", value: user.stats.reviews },
  ];
  const premium = user.planType === "premium";
  const until = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={[styles.avatar, styles.center]}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.who}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {user.name}
            </Text>
            {user.isVerified && <Ionicons name="checkmark-circle" size={15} color={colors.accent} />}
          </View>
          <Text style={styles.username} numberOfLines={1}>
            @{user.username} · since {new Date(user.memberSince).getFullYear()}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, premium && styles.badgeOn]}>
              <Ionicons
                name={premium ? "ribbon" : "person-outline"}
                size={10}
                color={premium ? colors.accent : colors.muted}
              />
              <Text style={[styles.badgeText, premium && styles.badgeTextOn]}>
                {premium ? "Premium" : "Free plan"}
              </Text>
            </View>
            {premium && !!until && <Text style={styles.until}>until {until}</Text>}
            {user.isStaff && (
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark-outline" size={10} color={colors.muted} />
                <Text style={styles.badgeText}>Staff</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Five cells at a fixed 31% left a two-up second row that looked like a
          layout bug. They grow to fill whatever the row has instead. */}
      <View style={styles.statGrid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {GROUPS.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text style={styles.groupTitle}>{g.title.toUpperCase()}</Text>
          <View style={styles.card}>
            {g.rows.map((r, i) => (
              <MenuRow key={r.href} row={r} first={i === 0} />
            ))}
          </View>
        </View>
      ))}

      {/* Was a bare red word with an onPress — the one destructive action on the
          screen, and the only one with no button around it. */}
      <Press
        style={styles.signOut}
        haptic="warning"
        accessibilityLabel="Sign out of this account"
        onPress={async () => {
          await signOut();
          router.replace("/");
        }}
      >
        <Ionicons name="log-out-outline" size={16} color={colors.danger} />
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Press>
    </ScrollView>
  );
}

/** The `icon` was being rendered as a bare string, so every row read "chart Stats". */
function MenuRow({ row, first }: { row: Row; first: boolean }) {
  const router = useRouter();
  return (
    <Press
      style={[styles.menuRow, !first && styles.menuRowRule]}
      onPress={() => router.push(row.href as never)}
      accessibilityLabel={row.hint ? `${row.label}. ${row.hint}` : row.label}
    >
      <View style={styles.menuIcon}>
        <Ionicons name={row.icon} size={16} color={colors.accent} />
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuLabel}>{row.label}</Text>
        {!!row.hint && <Text style={styles.menuHint}>{row.hint}</Text>}
      </View>
      {/* Was a "›" glyph, which sits on a different baseline per platform. */}
      <Ionicons name="chevron-forward" size={16} color={colors.dim} />
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 44 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.surface },
  avatarText: { color: colors.accent, fontSize: 24, fontWeight: "800" },
  who: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1 },
  username: { color: colors.muted, fontSize: 12 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 3 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOn: { backgroundColor: colors.accentSoft },
  badgeText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  badgeTextOn: { color: colors.accent },
  until: { color: colors.dim, fontSize: 10.5 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  stat: {
    flexGrow: 1,
    flexBasis: 92,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 10.5 },
  group: { marginTop: 22 },
  groupTitle: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  menuRowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  menuHint: { color: colors.dim, fontSize: 11 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    marginTop: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  signOutLabel: { color: colors.danger, fontSize: 13.5, fontWeight: "800" },
});
