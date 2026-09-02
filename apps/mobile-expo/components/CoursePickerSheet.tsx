import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import type { CourseSummary } from "../lib/types";

/**
 * Pick courses out of the existing catalogue. A list you can only name is an
 * empty shelf, so this is the piece that makes one mean anything: search the
 * catalogue, tick a few, add them in one request.
 *
 * `already` are the ids the list holds; they stay visible but locked so it is
 * obvious the course is in there rather than missing from the search.
 *
 * `single` swaps ticking for picking: a circle post carries one recommendation,
 * so tapping a row there returns it immediately instead of building a set.
 */
export function CoursePickerSheet({
  visible,
  already,
  onClose,
  onAdd,
  busy,
  single,
  heading = "Add courses",
  cta = "Add",
}: {
  visible: boolean;
  already: string[];
  onClose: () => void;
  onAdd: (courseIds: string[], courses: CourseSummary[]) => void;
  busy?: boolean;
  single?: boolean;
  heading?: string;
  cta?: string;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const have = useMemo(() => new Set(already), [already]);

  // 300ms is long enough that typing a title doesn't fire a request per keystroke.
  useEffect(() => {
    if (!q.trim()) {
      setDq("");
      return;
    }
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reopening should start clean rather than resume someone else's half-made pick.
  useEffect(() => {
    if (!visible) {
      setQ("");
      setDq("");
      setPicked([]);
    }
  }, [visible]);

  const { data, isLoading } = useQuery({
    queryKey: ["course-picker", dq],
    // No query: the catalogue's most-downloaded is a better starting shelf than
    // whatever happens to be newest.
    queryFn: () => api.browse(dq ? { q: dq, limit: 30 } : { sort: "most-downloaded", limit: 30 }),
    enabled: visible,
  });

  const results = data?.results ?? [];

  const toggle = (c: CourseSummary) => {
    if (single) {
      onAdd([c.id], [c]);
      return;
    }
    setPicked((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{heading}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.done}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder="Search the catalogue…"
            placeholderTextColor={colors.dim}
            autoCorrect={false}
          />

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : results.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{dq ? `Nothing matches “${dq}”.` : "The catalogue is empty."}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(c) => c.id}
              style={styles.list}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const owned = have.has(item.id);
                const on = picked.includes(item.id);
                const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
                return (
                  <Pressable
                    style={[styles.row, owned && { opacity: 0.55 }]}
                    onPress={() => !owned && toggle(item)}
                    disabled={owned}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]}>
                        <Text style={{ color: colors.dim, fontSize: 12 }}>▶</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.muted}>
                        {owned ? "already in this list" : `★ ${item.ratingAvg.toFixed(1)} · ${item.level}`}
                      </Text>
                    </View>
                    <View style={[styles.tick, (on || owned) && styles.tickOn]}>
                      <Text style={[styles.tickLabel, (on || owned) && styles.tickLabelOn]}>
                        {on || owned ? "✓" : "＋"}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          {/* Single-pick commits on the row tap, so a confirm button would be a
              second press that does nothing. */}
          {!single && (
            <Pressable
              style={[styles.primaryBtn, (picked.length === 0 || busy) && { opacity: 0.4 }]}
              disabled={picked.length === 0 || busy}
              onPress={() => onAdd(picked, results.filter((r) => picked.includes(r.id)))}
            >
              <Text style={styles.primaryLabel}>
                {busy ? "Adding…" : picked.length === 0 ? cta : `${cta} ${picked.length}`}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    maxHeight: "86%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  list: { marginTop: 12, maxHeight: 380 },
  center: { padding: 30, alignItems: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 10,
  },
  thumb: { width: 34, height: 48, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: colors.accentSoft },
  tickLabel: { color: colors.dim, fontSize: 13, fontWeight: "800" },
  tickLabelOn: { color: colors.accent },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
});
