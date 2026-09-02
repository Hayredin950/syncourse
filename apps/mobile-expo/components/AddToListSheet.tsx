import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { CollectionMembership } from "../lib/types";

/**
 * "Add to list" from anywhere a course is shown. The API answers with your lists
 * *and* whether each already holds the course, so a tick means "in this list" —
 * tapping it removes, rather than blindly re-posting an item already there.
 *
 * It also creates a list inline: being sent to the Lists tab to make one and then
 * finding your way back to the course is the reason nobody ever filled a list.
 */
export function AddToListSheet({
  visible,
  courseId,
  courseTitle,
  onClose,
}: {
  visible: boolean;
  courseId: string;
  courseTitle: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const key = ["lists-for-course", courseId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.listsForCourse(courseId),
    enabled: visible,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // A stale "Added to Weekend reading" on reopening would be a claim about a
  // course that may not even be the one on screen now.
  useEffect(() => {
    if (!visible) {
      setNote(null);
      setCreating(false);
      setNewName("");
    }
  }, [visible]);

  const say = (message: string, bad = false) => {
    setFailed(bad);
    setNote(message);
  };

  const toggle = async (l: CollectionMembership) => {
    setBusy(l.id);
    try {
      if (l.contains) await api.removeListItem(l.id, courseId);
      else await api.addListItems(l.id, [courseId]);
      // Local flip keeps the tick honest without a second round trip.
      queryClient.setQueryData<CollectionMembership[]>(key, (prev) =>
        (prev ?? []).map((row) =>
          row.id === l.id
            ? { ...row, contains: !row.contains, itemCount: row.itemCount + (row.contains ? -1 : 1) }
            : row,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
      queryClient.invalidateQueries({ queryKey: ["list-detail", l.id] });
      say(l.contains ? `Removed from ${l.name}` : `Added to ${l.name}`);
    } catch (e) {
      say((e as Error).message || "Could not update that list", true);
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    try {
      const list = await api.createList({ name, visibility: "private" });
      await api.addListItems(list.id, [courseId]);
      setNewName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
      say(`Added to ${list.name}`);
    } catch (e) {
      say((e as Error).message || "Could not create that list", true);
    } finally {
      setBusy(null);
    }
  };

  const lists = data ?? [];
  // A 401 is not a failure worth reporting as one — it just means no account yet.
  const problem = !error
    ? null
    : (error as api.ApiError).status === 401
      ? "Sign in to keep lists of your own."
      : (error as Error).message || "Could not load your lists.";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to list</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.done}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.muted} numberOfLines={2}>
            {courseTitle}
          </Text>
          {note ? <Text style={[styles.note, failed && { color: colors.danger }]}>{note}</Text> : null}

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : problem ? (
            <View style={styles.center}>
              <Text style={styles.centered}>{problem}</Text>
            </View>
          ) : lists.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.centered}>No lists yet — name one below and this course goes straight into it.</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {lists.map((l) => (
                <Pressable key={l.id} style={styles.row} onPress={() => toggle(l)} disabled={busy === l.id}>
                  <View style={[styles.tick, l.contains && styles.tickOn]}>
                    {busy === l.id ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <Text style={[styles.tickLabel, l.contains && styles.tickLabelOn]}>
                        {l.contains ? "✓" : "＋"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{l.name}</Text>
                    <Text style={styles.muted}>
                      {l.visibility === "public" ? "🌐" : "🔒"} {l.itemCount}{" "}
                      {l.itemCount === 1 ? "course" : "courses"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* Nothing loaded, nothing to create into — a new list would fail the same way. */}
          {problem ? null : creating ? (
            <View style={{ marginTop: 14 }}>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="New list name"
                placeholderTextColor={colors.dim}
                autoFocus
                onSubmitEditing={createAndAdd}
              />
              <View style={styles.actions}>
                <Pressable style={styles.ghostBtn} onPress={() => setCreating(false)}>
                  <Text style={styles.ghostLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryBtn,
                    { flex: 1, marginTop: 0 },
                    (!newName.trim() || busy === "new") && { opacity: 0.4 },
                  ]}
                  disabled={!newName.trim() || busy === "new"}
                  onPress={createAndAdd}
                >
                  <Text style={styles.primaryLabel}>{busy === "new" ? "Creating…" : "Create & add"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.newBtn} onPress={() => setCreating(true)}>
              <Text style={styles.ghostLabel}>＋ New list</Text>
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
    maxHeight: "82%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  centered: { color: colors.muted, fontSize: 12, textAlign: "center" },
  note: { color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: 8 },
  center: { padding: 26, alignItems: "center" },
  list: { marginTop: 12, maxHeight: 320 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  tick: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: colors.accentSoft },
  tickLabel: { color: colors.dim, fontSize: 14, fontWeight: "800" },
  tickLabelOn: { color: colors.accent },
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
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  ghostLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  newBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 14,
  },
});
