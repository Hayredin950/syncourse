import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Empty } from "./Empty";
import { Note } from "./Note";
import { Press } from "./Press";
import { Sheet } from "./Sheet";
import { SkRows } from "./Skeleton";
import { Text, TextInput } from "./Type";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { plural, type CollectionMembership } from "../lib/types";

/**
 * "Add to list" from anywhere a course is shown. The API answers with your lists
 * *and* whether each already holds the course, so a tick means "in this list" —
 * tapping it removes, rather than blindly re-posting an item already there.
 *
 * It also creates a list inline: being sent to the Lists tab to make one and then
 * finding your way back to the course is the reason nobody ever filled a list.
 *
 * The panel is the shared `Sheet`, which scrolls its own body — this used to be a
 * `maxHeight: 320` ScrollView nested inside a fixed panel, so on a short screen
 * the create button sat below the fold with no way to reach it.
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ["lists-for-course", courseId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.listsForCourse(courseId),
    enabled: visible,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
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

  /* No timer on this one, unlike the screen-level `useToast`: the note lives
     inside the sheet the reader is still looking at, and the next tap replaces
     it. Closing the sheet is what clears it. */
  const say = (text: string, bad = false) => setNote({ text, bad });

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
  const status = (error as api.ApiError | null)?.status;
  // A 401 is not a failure worth reporting as one — it just means no account yet.
  const signedOut = !!error && status === 401;
  const problem = !error ? null : signedOut ? "signed-out" : "failed";

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add to list"
      subtitle={courseTitle}
      /* Nothing loaded, nothing to create into — a new list would fail the same way. */
      footer={
        problem ? undefined : creating ? (
          <View>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="New list name"
              placeholderTextColor={colors.dim}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createAndAdd}
            />
            <View style={styles.actions}>
              <Press style={styles.ghostBtn} onPress={() => setCreating(false)} accessibilityLabel="Cancel">
                <Text style={styles.ghostLabel}>Cancel</Text>
              </Press>
              <Press
                style={styles.primaryBtn}
                disabled={!newName.trim() || busy === "new"}
                onPress={createAndAdd}
                haptic="success"
                accessibilityLabel="Create the list and add this course to it"
              >
                <Text style={styles.primaryLabel}>{busy === "new" ? "Creating…" : "Create & add"}</Text>
              </Press>
            </View>
          </View>
        ) : (
          <Press style={styles.newBtn} onPress={() => setCreating(true)} accessibilityLabel="New list">
            <Ionicons name="add" size={17} color={colors.text} />
            <Text style={styles.ghostLabel}>New list</Text>
          </Press>
        )
      }
    >
      {!!note && <Note text={note.text} bad={note.bad} style={styles.noteGap} />}

      {isLoading ? (
        <SkRows n={4} thumb={32} />
      ) : problem === "signed-out" ? (
        // The old copy said "Sign in to keep lists of your own" and gave the
        // reader no way to do it.
        <Empty
          icon="person-circle-outline"
          title="Lists need an account"
          body="Sign in and this course goes into a list of your own."
          action={{
            label: "Sign in",
            onPress: () => {
              onClose();
              router.push("/auth");
            },
          }}
        />
      ) : problem ? (
        <Empty
          icon="cloud-offline-outline"
          title="Could not load your lists"
          body={(error as Error).message || "Check your connection and try again."}
        />
      ) : lists.length === 0 ? (
        <Empty
          icon="albums-outline"
          title="No lists yet"
          body="Name one below and this course goes straight into it."
        />
      ) : (
        <View style={styles.rows}>
          {lists.map((l) => (
            <Press
              key={l.id}
              style={styles.row}
              onPress={() => toggle(l)}
              disabled={busy === l.id}
              haptic
              accessibilityLabel={`${l.contains ? "Remove from" : "Add to"} ${l.name}`}
              accessibilityState={{ selected: l.contains }}
            >
              {/* Mid-request the tick shows an ellipsis rather than a spinner: the
                  glyph swaps inside the same 32px circle, so the row holds still. */}
              <View style={[styles.tick, l.contains && styles.tickOn]}>
                <Ionicons
                  name={busy === l.id ? "ellipsis-horizontal" : l.contains ? "checkmark" : "add"}
                  size={18}
                  color={busy === l.id ? colors.accent : l.contains ? colors.accent : colors.dim}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {l.name}
                </Text>
                <View style={styles.rowMetaRow}>
                  {/* Was a 🌐/🔒 emoji, which renders at a different size and
                      baseline on every OS and can't take the muted colour. */}
                  <Ionicons
                    name={l.visibility === "public" ? "globe-outline" : "lock-closed-outline"}
                    size={11}
                    color={colors.dim}
                  />
                  <Text style={styles.muted}>{plural(l.itemCount, "course")}</Text>
                </View>
              </View>
            </Press>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  /* Was a local copy of the success/failure note — a bare amber sentence for both
     outcomes at first, so "Could not update that list" looked exactly like "Added
     to Weekend reading". Both are `components/Note` now. */
  noteGap: { marginBottom: 12 },
  rows: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 58,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  muted: { color: colors.muted, fontSize: 11.5 },
  tick: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: colors.accentSoft },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 13.5, fontWeight: "800" },
  ghostBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  ghostLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
});
