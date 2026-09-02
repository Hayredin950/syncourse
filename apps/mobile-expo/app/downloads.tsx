import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
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
  const library = useQuery({ queryKey: ["my-library"], queryFn: api.myLibrary });

  const downloaded = library.data?.downloaded ?? [];

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>
        Every course the bot has sent you, newest first. Files live in your Telegram chat — reopen a course
        here to have the bot send it again.
      </Text>

      {library.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : downloaded.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Nothing downloaded yet.{"\n"}
            Open a course and tap Download to get it through the Telegram bot.
          </Text>
        </View>
      ) : (
        <FlatList
          data={downloaded}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.title}>
                  {item.title}
                </Text>
                <Text style={styles.muted}>
                  {item.level}
                  {item.downloadedAt
                    ? ` · ${new Date(item.downloadedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : ""}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  list: { gap: 10, paddingBottom: 32 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  title: { color: colors.text, fontSize: 14, fontWeight: "600" },
  chevron: { color: colors.dim, fontSize: 18 },
});
