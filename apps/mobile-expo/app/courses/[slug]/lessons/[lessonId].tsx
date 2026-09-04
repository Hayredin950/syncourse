import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Failed } from "../../../../components/Empty";
import { Note } from "../../../../components/Note";
import { Press } from "../../../../components/Press";
import { Sk } from "../../../../components/Skeleton";
import { Text } from "../../../../components/Type";
import * as api from "../../../../lib/api";
import { colors, elevation, radius } from "../../../../lib/tokens";
import { formatDurationSec } from "../../../../lib/types";

export default function LessonScreen() {
  const { slug, lessonId } = useLocalSearchParams<{ slug: string; lessonId: string }>();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  /** How the last download or Telegram send went — see the `Note` below. */
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: () => api.lessonDetail(lessonId!),
  });

  // On a tablet a 16px gutter drags a three-line paragraph across a thousand
  // pixels; cap the column at 720 and spend whatever is left on margin. Computed
  // before the early returns so the skeleton sits in the column the page will use.
  const gutter = Math.max(16, Math.round((width - 720) / 2));
  // 16:9, capped: a fixed 210px box letterboxed a phone and looked like a
  // thumbnail on a tablet.
  const playerH = Math.min(360, Math.round(((width - gutter * 2) * 9) / 16));

  /**
   * The player is built from `videoUri`, which is null until the reader asks for
   * a stream.
   *
   * It used to be built from `videoUri ?? ""` with an unconditional `play()` in
   * the setup callback, so every visit created a player pointed at an empty
   * source and told it to start — expo-video treats `null` as "no source yet",
   * an empty string as a source it cannot load.
   */
  const player = useVideoPlayer(videoUri, (p) => {
    if (videoUri) p.play();
  });

  const videoMut = useMutation({
    mutationFn: () => api.videoUrl(lessonId!),
    onSuccess: (d) => setVideoUri(d.url),
  });

  /* All three of these used to be `Alert.alert("Telegram", …)` — an OS dialog
     that has to be dismissed before the page can be touched again, for news as
     small as "sent". They print in the page now, where the button was. */
  const telegramMut = useMutation({
    mutationFn: () => api.downloadToTelegram(lessonId!),
    onMutate: () => setNotice(null),
    onSuccess: (r) => setNotice({ text: r.message ?? "Sent — check your Telegram bot." }),
    onError: (e: unknown) =>
      setNotice({ text: e instanceof Error ? e.message : "Could not send this lesson to Telegram.", bad: true }),
  });

  /** Signed file URL, then hand it to the OS. Used by every file row. */
  const openAttachment = async (attachmentId: string) => {
    setNotice(null);
    try {
      const r = await api.fileUrl(lessonId!, attachmentId);
      void api.recordDownload(lessonId!, r.fileName);
      await Linking.openURL(r.url);
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : "Sign in to download course files.",
        bad: true,
      });
    }
  };

  // error must be checked BEFORE `!data`: on failure data is always undefined,
  // so the old order made this branch unreachable and left a permanent spinner
  if (error) {
    return (
      <View style={styles.dead}>
        <Failed
          title="Could not load this lesson"
          body={
            (error as api.ApiError | null)?.status === 404
              ? "It may have been moved or unpublished since you last saw it."
              : "Check your connection and try again."
          }
          onRetry={() => refetch()}
        />
        {/* A lesson that will not load is a dead end with a back button to the
            same dead end. `replace`, so Back leaves rather than returns here. */}
        {!!slug && (
          <Press
            style={styles.ghostWide}
            onPress={() => router.replace(`/courses/${slug}` as never)}
            accessibilityLabel="Back to the course"
          >
            <Ionicons name="albums-outline" size={14} color={colors.text} />
            <Text style={styles.ghostWideLabel}>Back to the course</Text>
          </Press>
        )}
      </View>
    );
  }
  /* Was `SkText lines={7}`: seven grey lines, then a 16:9 player and two pill
     buttons dropped in and shoved every one of them down the page. */
  if (isLoading || !data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <Sk style={styles.skTitle} />
        <Sk style={styles.skMeta} />
        <Sk style={[styles.skPlayer, { height: playerH }]} />
        <View style={styles.actionRow}>
          <Sk style={styles.skBtn} />
          <Sk style={styles.skBtn} />
        </View>
        <Sk style={styles.skHeading} />
        {[0, 1, 2].map((i) => (
          <Sk key={i} style={styles.skRow} />
        ))}
      </ScrollView>
    );
  }

  const l = data;
  const firstFile = l.attachments[0];

  return (
    <ScrollView
      style={styles.screen}
      /* Was a flat 44. On a gesture-bar phone the last note ended under the bar
         with nothing below it to scroll into view. */
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: gutter, paddingBottom: Math.max(44, insets.bottom + 32) },
      ]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      {/* The header said "Lesson" on every one of them. */}
      <Stack.Screen options={{ title: l.title }} />
      <Text style={styles.title}>{l.title}</Text>
      <Text style={styles.muted}>
        {[l.course.title, l.sectionTitle, formatDurationSec(l.durationSec)].filter(Boolean).join(" · ")}
      </Text>

      {videoUri ? (
        // `allowsFullscreen` was silently dead: expo-video 57 replaced it with
        // `fullscreenOptions`, and an unknown prop on a native view is dropped
        // without a warning. Lectures are 16:9, so fullscreen goes landscape.
        <VideoView
          player={player}
          style={[styles.player, { height: playerH }]}
          contentFit="contain"
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
        />
      ) : (
        <View style={[styles.player, styles.playerPlaceholder, { height: playerH }]}>
          <Press
            style={styles.playBtn}
            onPress={() => videoMut.mutate()}
            disabled={videoMut.isPending}
            accessibilityLabel="Play this lesson"
          >
            <Ionicons name={videoMut.isPending ? "hourglass-outline" : "play"} size={30} color={colors.onAccent} />
          </Press>
          {/* A raw fetch error ("Request failed with status 402") is not a
              sentence anybody can act on. */}
          <Text style={styles.playerNote}>
            {videoMut.error
              ? "That stream would not start. Sign in, or try again in a moment."
              : "Previews play without signing in."}
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        {/* This button used to be labelled "Download" and call the same
            video-url endpoint the play button calls — it streamed, it never
            downloaded. It now opens the lesson's own file, and hides itself when
            there is no file to open. */}
        {firstFile && (
          <Press style={styles.outlineBtn} onPress={() => openAttachment(firstFile.id)} haptic accessibilityLabel="Download the lesson file">
            <Ionicons name="download-outline" size={15} color={colors.text} />
            <Text style={styles.outlineLabel}>Download</Text>
          </Press>
        )}
        <Press
          style={styles.outlineBtn}
          onPress={() => telegramMut.mutate()}
          disabled={telegramMut.isPending}
          haptic
          accessibilityLabel="Send this lesson to Telegram"
        >
          <Ionicons name="paper-plane-outline" size={15} color={colors.text} />
          <Text style={styles.outlineLabel}>{telegramMut.isPending ? "Sending…" : "Telegram"}</Text>
        </Press>
      </View>

      {!!notice && (
        <Note text={notice.text} bad={notice.bad} onDismiss={() => setNotice(null)} style={styles.notice} />
      )}

      {l.attachments.length > 0 && (
        <>
          <Text style={styles.heading}>Download course files</Text>
          {l.attachments.map((a) => (
            <Press
              key={a.id}
              style={styles.fileRow}
              onPress={() => openAttachment(a.id)}
              haptic
              accessibilityLabel={`Download ${a.fileName || "course file"}`}
            >
              <Ionicons name="cube-outline" size={17} color={colors.dim} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.fileLabel}>
                  {a.fileName || "Course file"}
                </Text>
                <Text style={styles.muted}>
                  {[a.fileType, a.sizeMb > 0 ? `${a.sizeMb.toFixed(1)} MB` : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="download-outline" size={18} color={colors.accent} />
            </Press>
          ))}
        </>
      )}

      {l.files.length > 0 && (
        <>
          <Text style={styles.heading}>Available files</Text>
          {l.files.map((f) => (
            <View key={f.id} style={styles.fileRow}>
              <Ionicons name="document-text-outline" size={17} color={colors.dim} />
              <View style={styles.rowText}>
                <Text style={styles.fileLabel}>{f.label}</Text>
                <Text style={styles.muted}>
                  {[f.format, `${f.sizeMb.toFixed(1)} MB`, f.codec].filter(Boolean).join(" · ")}
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
  content: { paddingTop: 14, paddingBottom: 44 },
  // The error branch is its own screen, not a strip at the top of an empty one.
  dead: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", paddingHorizontal: 24 },
  ghostWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  ghostWideLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  title: { color: colors.text, fontSize: 21, fontWeight: "800", letterSpacing: -0.3, lineHeight: 27 },
  player: {
    width: "100%",
    marginTop: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  playerPlaceholder: { alignItems: "center", justifyContent: "center", gap: 14 },
  /**
   * Was a 56px "▶" glyph in a Text style: nothing to press, no press state, and
   * the triangle's own left-hand whitespace pushed it off centre.
   */
  playBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    paddingLeft: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    ...elevation[2],
  },
  playerNote: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 28,
  },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  // Was a Text with textAlign: the border drew round the label, so the tap
  // target was the height of one line of 13px type.
  outlineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  outlineLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  /* Matches the auth screen and the paywall — see components/Note. */
  notice: { marginTop: 12 },
  heading: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fileLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  // Was an inline {flex: 1} on the middle column of both file rows; without
  // minWidth a long filename pushes the download chevron off the card.
  rowText: { flex: 1, minWidth: 0 },
  bestBadge: { backgroundColor: colors.accentSoft, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  bestText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  note: {
    padding: 13,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteTitle: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  noteBody: { color: colors.body, fontSize: 13, lineHeight: 20, marginTop: 7 },
  // Skeleton — the same blocks, in the same places, as the loaded page.
  skTitle: { height: 26, width: "72%", borderRadius: 7 },
  skMeta: { height: 12, width: "48%", borderRadius: 6, marginTop: 9 },
  skPlayer: { width: "100%", marginTop: 14, borderRadius: radius.lg },
  skBtn: { flex: 1, height: 46, borderRadius: radius.pill },
  skHeading: { height: 16, width: 180, borderRadius: 6, marginTop: 24, marginBottom: 10 },
  skRow: { height: 60, borderRadius: radius.md, marginBottom: 8 },
});
