import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty } from "./Empty";
import { Press } from "./Press";
import { Sheet } from "./Sheet";
import { SkRows } from "./Skeleton";
import { Text, TextInput } from "./Type";
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
 *
 * The panel is the shared `Sheet` with `scroll={false}`, because the body is a
 * FlatList and a virtualised list nested in a ScrollView loses its windowing.
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
  const { height } = useWindowDimensions();
  // Was a flat `maxHeight: 380`, which is most of a small phone and a third of a
  // tablet. The sheet itself is capped at 88%, so the list takes a share of the
  // screen and leaves room for the search box and the confirm button.
  const listH = Math.max(200, Math.round(height * 0.44));

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
    <Sheet
      visible={visible}
      onClose={onClose}
      title={heading}
      subtitle={
        single
          ? "Tap a course to pick it"
          : picked.length > 0
            ? `${picked.length} picked`
            : "Tick as many as you like"
      }
      scroll={false}
      /* Single-pick commits on the row tap, so a confirm button would be a
         second press that does nothing. */
      footer={
        single ? undefined : (
          <Press
            style={styles.primaryBtn}
            disabled={picked.length === 0 || busy}
            onPress={() => onAdd(picked, results.filter((r) => picked.includes(r.id)))}
            haptic="success"
            accessibilityLabel={`${cta} ${picked.length} selected`}
          >
            <Text style={styles.primaryLabel}>
              {busy ? "Adding…" : picked.length === 0 ? cta : `${cta} ${picked.length}`}
            </Text>
          </Press>
        )
      }
    >
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={15} color={colors.dim} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Search the catalogue…"
          placeholderTextColor={colors.dim}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {q.length > 0 && (
          <Press onPress={() => setQ("")} accessibilityLabel="Clear the search box" style={styles.clear}>
            <Ionicons name="close-circle" size={16} color={colors.dim} />
          </Press>
        )}
      </View>
      {isLoading ? (
        <View style={styles.loading}>
          <SkRows n={5} thumb={34} />
        </View>
      ) : results.length === 0 ? (
        <Empty
          icon="search"
          title={dq ? `Nothing matches “${dq}”` : "The catalogue is empty"}
          body={dq ? "Try a shorter phrase." : undefined}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          style={[styles.list, { maxHeight: listH }]}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const owned = have.has(item.id);
            const on = picked.includes(item.id);
            const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
            return (
              <Press
                style={[styles.row, owned && styles.rowOwned]}
                onPress={() => !owned && toggle(item)}
                disabled={owned}
                haptic
                accessibilityLabel={
                  owned ? `${item.title}, already added` : `${on ? "Unpick" : "Pick"} ${item.title}`
                }
                accessibilityState={{ selected: on || owned }}
              >
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Ionicons name="school-outline" size={14} color={colors.dim} />
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {owned ? (
                    <Text style={styles.muted}>Already added</Text>
                  ) : (
                    <View style={styles.metaRow}>
                      {item.ratingCount > 0 && (
                        <>
                          <Ionicons name="star" size={10} color={colors.star} />
                          <Text style={styles.muted}>{item.ratingAvg.toFixed(1)}</Text>
                          <Text style={styles.muted}>·</Text>
                        </>
                      )}
                      <Text style={styles.muted}>{item.level}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.tick, (on || owned) && styles.tickOn]}>
                  <Ionicons
                    name={on || owned ? "checkmark" : "add"}
                    size={16}
                    color={on || owned ? colors.accent : colors.dim}
                  />
                </View>
              </Press>
            );
          }}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  input: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 14 },
  clear: { padding: 2 },
  loading: { paddingTop: 6 },
  list: { marginTop: 12 },
  listContent: { gap: 8, paddingVertical: 4 },
  muted: { color: colors.muted, fontSize: 11.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowOwned: { opacity: 0.55 },
  thumb: { width: 34, height: 48, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  tick: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: colors.accentSoft },
  primaryBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
});
