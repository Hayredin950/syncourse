import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";
import type { CourseSummary } from "../../lib/types";

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
  const router = useRouter();

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

  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    enabled: query.trim().length > 0,
  });

  useEffect(() => {
    const t = setTimeout(() => {}, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search courses, lecturers, tags…"
            placeholderTextColor={colors.dim}
            style={styles.input}
            autoFocus
          />
          <Pressable
            onPress={toggleVoice}
            style={[styles.mic, listening && styles.micActive]}
          >
            <Text style={[styles.micIcon, listening && styles.micIconActive]}>
              {listening ? "■" : "🎙"}
            </Text>
          </Pressable>
        </View>
        {listening && (
          <Text style={styles.voiceNote}>Listening… speak now</Text>
        )}
        {voiceNote !== "" && !listening && (
          <Text style={styles.voiceNote}>{voiceNote}</Text>
        )}
      </View>

      {query.trim().length === 0 ? (
        <View style={styles.trending}>
          <Text style={styles.trendingTitle}>Everyone is searching</Text>
          <View style={styles.chips}>
            {(trending.data?.trending ?? []).map((t) => (
              <Text key={t} style={styles.chip} onPress={() => setQuery(t)}>
                {t}
              </Text>
            ))}
          </View>
        </View>
      ) : results.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={results.data?.courses ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No results for “{query}”</Text>}
          renderItem={({ item }) => <SearchRow course={item} />}
        />
      )}
    </View>
  );
}

function SearchRow({ course }: { course: CourseSummary }) {
  const router = useRouter();
  return (
    <Pressable style={styles.row} onPress={() => router.push(`/courses/${course.slug}`)}>
      <View style={styles.thumb}>
        <Text style={{ color: colors.dim, fontSize: 14 }}>▶</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {course.title}
        </Text>
        <Text style={styles.rowMeta}>
          {course.level} · {course.ratingAvg.toFixed(1)}★
        </Text>
      </View>
      <Text style={{ color: colors.dim }}>▢</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBar: { paddingHorizontal: 16, paddingVertical: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  mic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  micActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  micIcon: { fontSize: 16 },
  micIconActive: { color: "#000" },
  voiceNote: { color: colors.accent, fontSize: 11, textAlign: "center", marginTop: 6 },
  trending: { padding: 16 },
  trendingTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 13 },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 12 },
});
