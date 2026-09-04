import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../components/Empty";
import { Press } from "../components/Press";
import { SkRows } from "../components/Skeleton";
import { Text } from "../components/Type";
import * as api from "../lib/api";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";

/**
 * Courses this reader has pulled through the Telegram bot.
 *
 * The old screen filtered a hardcoded empty list of lesson files by video codec
 * and then listed "in progress" courses by percentage — none of which exists:
 * a course is delivered as an archive in Telegram, and the bot records one
 * DownloadEvent per delivery. So this is simply the download history.
 */
export default function DownloadsScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["my-library"],
    queryFn: api.myLibrary,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const downloaded = data?.downloaded ?? [];
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={6} thumb={40} />
      </View>
    );
  }
  if (error) {
    // A 401 is the ordinary case for a signed-out reader, not a failure.
    return (error as api.ApiError).status === 401 ? (
      <Empty
        icon="person-circle-outline"
        title="Downloads live with your account"
        body="Sign in to see every course the bot has sent you."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your downloads" onRetry={() => refetch()} />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={downloaded}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          downloaded.length === 0 ? null : (
            <Text style={styles.hint}>
              Every course the bot has sent you, newest first. The files live in your Telegram chat — reopen a
              course here to have the bot send it again.
            </Text>
          )
        }
        ListEmptyComponent={
          <Empty
            icon="cloud-download-outline"
            title="Nothing downloaded yet"
            body="Open a course and tap Download; the bot sends the files to your Telegram chat."
            action={{ label: "Browse courses", href: "/browse" }}
          />
        }
        renderItem={({ item }) => {
          const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
          const meta = [item.level, item.downloadedAt ? day(item.downloadedAt) : null]
            .filter(Boolean)
            .join(" · ");
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
                  <Ionicons name="school-outline" size={16} color={colors.dim} />
                </View>
              )}
              <View style={styles.body}>
                <Text numberOfLines={2} style={styles.title}>
                  {item.title}
                </Text>
                <Text style={styles.muted}>{meta}</Text>
              </View>
              {/* Was a "›" glyph, which lands on a different baseline on every OS. */}
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Press>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  list: { paddingVertical: 16, gap: 10, paddingBottom: 40, flexGrow: 1 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  center: { alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  title: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
});
