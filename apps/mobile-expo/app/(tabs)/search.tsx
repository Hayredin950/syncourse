import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Image, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkRows } from "../../components/Skeleton";
import { Stars } from "../../components/StarRating";
import { Text, TextInput } from "../../components/Type";
import { cloudinaryUrl } from "../../lib/cloudinary";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import { formatDuration, type CourseSummary } from "../../lib/types";

/** Web Speech API on web (react-native-web); null on native without a module. */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");

  const toggleVoice = () => {
    const rec = getSpeechRecognition();
    if (!rec) {
      setVoiceNote("Voice search needs the browser build (or a speech module).");
      setTimeout(() => setVoiceNote(""), 3000);
      return;
    }
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) setQuery(transcript.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const trending = useQuery({ queryKey: ["trending"], queryFn: api.trendingSearches });

  /**
   * The query key follows a *debounced* copy of the box.
   *
   * It used to follow `query` itself, so typing "javascript" fired ten searches
   * and cancelled nine of them — ten cold-start-able round trips to Render for
   * one intent. (There was also a `useEffect` here with an empty `setTimeout(…, 0)`
   * in it, which is what a debounce looks like after the debounce is deleted.)
   */
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 320);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ["search", term],
    queryFn: () => api.search(term),
    enabled: term.length > 0,
    // Keep the last list on screen while the next one loads: swapping results
    // for a skeleton on every accepted keystroke made the page strobe.
    placeholderData: keepPreviousData,
  });

  const typing = query.trim() !== term;
  const courses = results.data?.courses ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={colors.dim} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search courses, lecturers, tags…"
              placeholderTextColor={colors.dim}
              style={styles.input}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={() => setTerm(query.trim())}
              autoFocus
            />
            {/* Clearing a search on a phone meant holding backspace. */}
            {query.length > 0 && (
              <Press onPress={() => setQuery("")} accessibilityLabel="Clear the search box" style={styles.clear}>
                <Ionicons name="close-circle" size={17} color={colors.dim} />
              </Press>
            )}
          </View>
          <Press
            onPress={toggleVoice}
            style={[styles.mic, listening && styles.micActive]}
            haptic
            accessibilityLabel={listening ? "Stop listening" : "Search by voice"}
            accessibilityState={{ selected: listening }}
          >
            <Ionicons name={listening ? "stop" : "mic"} size={17} color={listening ? colors.onAccent : colors.text} />
          </Press>
        </View>
        {listening && <Text style={styles.voiceNote}>Listening… speak now</Text>}
        {voiceNote !== "" && !listening && <Text style={styles.voiceNote}>{voiceNote}</Text>}
      </View>

      {query.trim().length === 0 ? (
        (trending.data?.trending ?? []).length > 0 ? (
          <View style={styles.trending}>
            <Text style={styles.trendingTitle}>Everyone is searching</Text>
            <View style={styles.chips}>
              {(trending.data?.trending ?? []).map((t) => (
                <Press key={t} style={styles.chip} onPress={() => setQuery(t)} accessibilityLabel={`Search for ${t}`}>
                  <Ionicons name="trending-up" size={12} color={colors.accent} />
                  <Text style={styles.chipText}>{t}</Text>
                </Press>
              ))}
            </View>
          </View>
        ) : (
          <Empty
            icon="search"
            title="Search the library"
            body="Find a course by title, lecturer, school or tag."
          />
        )
      ) : (results.isLoading || typing) && courses.length === 0 ? (
        <View style={styles.list}>
          <SkRows n={6} thumb={54} />
        </View>
      ) : /* Without this branch a dropped connection printed "Nothing matches
            “react”" — the library answering, rather than the network failing. */
      results.error && courses.length === 0 ? (
        <Failed
          title="Search did not come back"
          body={
            (results.error as api.ApiError | null)?.status
              ? "The library is not answering right now. Try again in a moment."
              : "Check your connection and try again."
          }
          onRetry={() => results.refetch()}
        />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          /* A search result page ages the same way a shelf does — a course can be
             unpublished between the query and the tap. `keepPreviousData` means the
             rows stay put while it re-runs. */
          refreshControl={
            <RefreshControl
              refreshing={results.isFetching && !results.isLoading}
              onRefresh={() => results.refetch()}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <Empty
              icon="search"
              title={`Nothing matches “${term}”`}
              body="Try a shorter phrase, or browse the whole library."
              action={{ label: "Browse everything", href: "/browse" }}
            />
          }
          renderItem={({ item }) => <SearchRow course={item} />}
        />
      )}
    </View>
  );
}

function SearchRow({ course }: { course: CourseSummary }) {
  const router = useRouter();
  /* The rating used to close this line as `${avg} ★`. Manrope has no star, so
     the last glyph on every rated row came from a fallback font. */
  const meta = [course.level, formatDuration(course.durationMin)].filter(Boolean).join(" · ");
  return (
    <Press
      style={styles.row}
      onPress={() => router.push(`/courses/${course.slug}`)}
      accessibilityLabel={course.title}
    >
      {/* Was a grey square holding a "▶" glyph on every row, whether or not the
          course had a cover — the covers were right there in the response. */}
      {course.thumbnailUrl ? (
        <Image
          source={{ uri: cloudinaryUrl(course.thumbnailUrl, { width: 108, height: 144 }) ?? undefined }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="school-outline" size={17} color={colors.dim} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {course.title}
        </Text>
        <View style={styles.rowMetaRow}>
          {course.ratingCount > 0 && <Stars value={course.ratingAvg} size={10} />}
          {!!meta && (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {course.ratingCount > 0 ? `· ${meta}` : meta}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.dim} />
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBar: { paddingHorizontal: 16, paddingVertical: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 11,
    fontSize: 14,
  },
  clear: { padding: 2 },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  micActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  voiceNote: { color: colors.accent, fontSize: 11, textAlign: "center", marginTop: 8 },
  trending: { padding: 16 },
  trendingTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  // flexGrow, so the "nothing matches" card centres in the space below the box
  // instead of sitting against the search bar.
  list: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 54, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  rowMeta: { color: colors.muted, fontSize: 12, flexShrink: 1 },
});
