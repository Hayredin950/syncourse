import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../../../lib/api";
import { colors } from "../../../../lib/tokens";
import { formatDurationSec } from "../../../../lib/types";

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const queryClient = useQueryClient();
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: () => api.lessonDetail(lessonId!),
  });

  const player = useVideoPlayer(videoUri ?? "", (p) => {
    p.play();
  });

  const videoMut = useMutation({
    mutationFn: () => api.videoUrl(lessonId!),
    onSuccess: (d) => setVideoUri(d.url),
  });

  const completeMut = useMutation({
    mutationFn: () => api.markComplete(lessonId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] }),
  });

  const telegramMut = useMutation({
    mutationFn: () => api.downloadToTelegram(lessonId!),
    onSuccess: (r) => Alert.alert("Telegram", r.message ?? "Check your Telegram bot."),
    onError: (e: any) => Alert.alert("Telegram", e?.message ?? "Could not send to Telegram"),
  });

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this lesson</Text>
      </View>
    );
  }

  const l = data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{l.title}</Text>
      <Text style={styles.muted}>
        {l.course.title}
        {l.sectionTitle ? ` · ${l.sectionTitle}` : ""} · {formatDurationSec(l.durationSec)}
      </Text>

      {videoUri ? (
        <VideoView player={player} style={styles.player} contentFit="contain" />
      ) : (
        <View style={[styles.player, styles.playerPlaceholder]}>
          <Text style={styles.playBtn} onPress={() => videoMut.mutate()}>
            {videoMut.isPending ? "…" : "▶"}
          </Text>
          <Text style={styles.muted}>
            {videoMut.error
              ? String((videoMut.error as Error).message)
              : "Stream from R2 via signed URL (previews play without sign-in)"}
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Text
          style={styles.outlineBtn}
          onPress={() => completeMut.mutate()}
        >
          {completeMut.isPending ? "…" : l.watched ? "✓ Completed" : "Mark complete"}
        </Text>
        <Text
          style={styles.outlineBtn}
          onPress={() => videoMut.mutate()}
        >
          ⬇ Download
        </Text>
        <Text
          style={[styles.outlineBtn, telegramMut.isPending && { opacity: 0.5 }]}
          onPress={() => telegramMut.mutate()}
        >
          {telegramMut.isPending ? "…" : "✈ Telegram"}
        </Text>
      </View>

      {l.attachments.length > 0 && (
        <>
          <Text style={styles.heading}>Download course files</Text>
          {l.attachments.map((a) => (
            <Pressable
              key={a.id}
              style={styles.fileRow}
              onPress={async () => {
                try {
                  const r = await api.fileUrl(l.id, a.id);
                  void api.recordDownload(l.id, r.fileName);
                  await Linking.openURL(r.url);
                } catch (e) {
                  Alert.alert("Download", e instanceof Error ? e.message : "Enroll in the course to download files");
                }
              }}
            >
              <Text style={{ color: colors.dim }}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.fileLabel}>
                  {a.fileName || "Course file"}
                </Text>
                <Text style={styles.muted}>
                  {a.fileType}
                  {a.sizeMb > 0 ? ` · ${a.sizeMb.toFixed(1)} MB` : ""}
                </Text>
              </View>
              <Text style={styles.downloadBtn}>⬇</Text>
            </Pressable>
          ))}
        </>
      )}

      {l.files.length > 0 && (
        <>
          <Text style={styles.heading}>Available files</Text>
          {l.files.map((f) => (
            <View key={f.id} style={styles.fileRow}>
              <Text style={{ color: colors.dim }}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileLabel}>{f.label}</Text>
                <Text style={styles.muted}>
                  {f.format} · {f.sizeMb.toFixed(1)} MB{f.codec ? ` · ${f.codec}` : ""}
                </Text>
              </View>
              {f.isBest && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestText}>BEST</Text>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      <Text style={styles.heading}>Notes</Text>
      {l.notes.length === 0 && <Text style={styles.muted}>No notes for this lesson yet.</Text>}
      {l.notes.map((n) => (
        <View key={n.id} style={styles.note}>
          <View style={styles.noteTop}>
            <Text style={styles.noteTitle}>{n.title}</Text>
            {n.isCheatsheet && (
              <View style={styles.bestBadge}>
                <Text style={styles.bestText}>CHEAT-SHEET</Text>
              </View>
            )}
          </View>
          {!!n.richText && <Text style={styles.noteBody}>{n.richText}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  player: {
    width: "100%",
    height: 210,
    borderRadius: 14,
    backgroundColor: colors.surface,
    marginTop: 14,
  },
  playerPlaceholder: { alignItems: "center", justifyContent: "center", gap: 10 },
  playBtn: {
    color: colors.accent,
    fontSize: 56,
    textAlign: "center",
    lineHeight: 60,
  },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  outlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 11,
  },
  heading: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  fileLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  downloadBtn: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  bestBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bestText: { color: colors.accent, fontSize: 9, fontWeight: "800" },
  note: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteTitle: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  noteBody: { color: "rgba(244,244,245,0.7)", fontSize: 13, lineHeight: 19, marginTop: 6 },
});
