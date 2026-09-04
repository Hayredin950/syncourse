import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkRows } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { plural, type LibraryCourse } from "../../lib/types";

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
type TabKey = "downloaded" | "saved" | "liked";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "downloaded", label: "Downloaded", icon: "cloud-download-outline" },
  { key: "saved", label: "Saved", icon: "bookmark-outline" },
  { key: "liked", label: "Liked", icon: "heart-outline" },
];

/** Each shelf empties for its own reason, so each says its own thing. */
const EMPTY: Record<TabKey, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  downloaded: {
    icon: "cloud-download-outline",
    title: "Nothing downloaded yet",
    body: "Courses you take through the Telegram bot land here, ready to open again.",
  },
  saved: {
    icon: "bookmark-outline",
    title: "Nothing saved yet",
    body: "Tap the bookmark on a course and it waits for you here.",
  },
  liked: {
    icon: "heart-outline",
    title: "Nothing liked yet",
    body: "Like a course and it stays here — and it teaches your recommendations.",
  },
};

export default function LibraryScreen() {
  const [tab, setTab] = useState<TabKey>("downloaded");
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["my-library"],
    queryFn: api.myLibrary,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={6} thumb={40} />
      </View>
    );
  }
  /* "Sign in to see your library" was the message for every failure, so a dropped
     connection read as being signed out. Only a 401 means that. */
  if (error || !data) {
    return (error as api.ApiError | null)?.status === 401 ? (
      <Empty
        icon="library-outline"
        title="Your library lives with your account"
        body="Sign in and everything you have downloaded, saved and liked is here."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your library" onRetry={() => refetch()} />
    );
  }

  const items = data[tab] ?? [];
  const counts = data.counts;
  const shelves = [
    counts.downloaded > 0 ? `${counts.downloaded} downloaded` : null,
    counts.saved > 0 ? `${counts.saved} saved` : null,
    counts.liked > 0 ? `${counts.liked} liked` : null,
  ].filter(Boolean);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>Your library</Text>
          <Text style={styles.subtitle}>
            {shelves.length > 0 ? shelves.join(" · ") : "Everything you download, save or like collects here."}
          </Text>
          {/* Was three bare Text nodes with an onPress: no tap target beyond the
              glyphs themselves, and nothing telling a screen reader they were
              controls or which one was on. */}
          <View style={styles.segmented}>
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Press
                  key={t.key}
                  style={[styles.seg, on && styles.segOn]}
                  onPress={() => setTab(t.key)}
                  haptic
                  accessibilityLabel={`${t.label}, ${plural(counts[t.key], "course")}`}
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={t.icon} size={14} color={on ? colors.accent : colors.muted} />
                  <Text style={[styles.segLabel, on && styles.segLabelOn]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </Press>
              );
            })}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Empty
          icon={EMPTY[tab].icon}
          title={EMPTY[tab].title}
          body={EMPTY[tab].body}
          action={{ label: "Browse courses", href: "/browse" }}
        />
      }
      renderItem={({ item }) => <LibraryRow item={item} />}
    />
  );
}

function LibraryRow({ item }: { item: LibraryCourse }) {
  const router = useRouter();
  const when = item.downloadedAt ?? item.savedAt ?? item.likedAt ?? null;
  const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
  const rated = item.ratingCount > 0;
  const meta = [item.level, rated ? item.ratingAvg.toFixed(1) : null].filter(Boolean).join(" · ");

  return (
    <Press
      style={styles.card}
      onPress={() => router.push(`/courses/${item.slug}`)}
      accessibilityLabel={`${item.title}. ${meta}`}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.center]}>
          <Ionicons name="school-outline" size={15} color={colors.dim} />
        </View>
      )}
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          {/* Was "★ 4.6" printed for every course, including the unrated ones,
              where it read "★ 0.0". */}
          {rated && <Ionicons name="star" size={11} color={colors.star} />}
          <Text style={styles.cardMeta}>{meta}</Text>
          {item.isPremium && (
            <View style={styles.premium}>
              <Text style={styles.premiumText}>Premium</Text>
            </View>
          )}
        </View>
      </View>
      {!!when && (
        <Text style={styles.when}>
          {/* Was locked to "en-US", so a phone set to any other locale still got
              the American order. */}
          {new Date(when).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Text>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, gap: 9, paddingBottom: 40, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { alignItems: "center", justifyContent: "center" },
  head: { gap: 4, marginBottom: 5 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  segmented: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 4,
    marginTop: 10,
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
  },
  segOn: { backgroundColor: colors.accentSoft },
  segLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  segLabelOn: { color: colors.accent },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  body: { flex: 1, minWidth: 0, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMeta: { color: colors.muted, fontSize: 11.5 },
  premium: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  premiumText: { color: colors.accent, fontSize: 9, fontWeight: "800" },
  when: { color: colors.dim, fontSize: 11 },
});
