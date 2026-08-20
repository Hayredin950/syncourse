import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { formatDurationSec, type LessonFile } from "../lib/types";

interface FileRow extends LessonFile {
  lessonTitle: string;
  lessonId: string;
  courseSlug: string;
}

const CODECS = ["All", "x264", "x265", "H264"];

export default function DownloadsScreen() {
  const router = useRouter();
  const [codec, setCodec] = useState("All");
  const myLearning = useQuery({ queryKey: ["my-learning"], queryFn: api.myLearning });

  const inProgress = myLearning.data?.inProgress ?? [];
  const files: FileRow[] = [];

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>
        Your offline files appear here. Streams are protected by short-lived signed URLs — downloads are
        recorded so course analytics stay accurate.
      </Text>

      <View style={styles.filters}>
        {CODECS.map((c) => (
          <Pressable key={c} style={[styles.chip, codec === c && styles.chipActive]} onPress={() => setCodec(c)}>
            <Text style={[styles.chipLabel, codec === c && styles.chipLabelActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {myLearning.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : files.length === 0 && inProgress.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            Nothing downloaded yet.{"\n"}
            Enroll in a course and download lessons from the lesson screen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={inProgress}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            files.length > 0 ? (
              <Text style={styles.muted}>{files.length} downloadable file(s) in your lessons</Text>
            ) : null
          }
          renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.title}>
                    {item.title}
                  </Text>
                  <Text style={styles.muted}>{item.progressPct}% complete</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(item.progressPct, 100)}%` }]} />
                </View>
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
  filters: { flexDirection: "row", gap: 8, marginBottom: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  chipLabelActive: { color: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12, textAlign: "center" },
  list: { gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 14, fontWeight: "600" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.bg, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.accent },
});
