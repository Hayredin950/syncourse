import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CoursePickerSheet } from "../../components/CoursePickerSheet";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import type { CourseCollectionDetail } from "../../lib/types";

/**
 * One list: what it holds, and — for its owner — everything needed to change that.
 *
 * Every mutation answers with the whole refreshed list, so the cache is swapped
 * wholesale rather than patched here; nothing recomputes `itemCount` by hand and
 * drifts away from the server.
 */
export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ["list-detail", id];
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.listDetail(id!),
    enabled: !!id,
  });

  const swap = (l: CourseCollectionDetail) => {
    queryClient.setQueryData(key, l);
    // The Lists tab prints a course count per row, so it goes stale with this.
    queryClient.invalidateQueries({ queryKey: ["my-lists"] });
  };
  const complain = (e: unknown) => Alert.alert("List", (e as Error).message || "That didn't work.");
  const addMut = useMutation({
    mutationFn: (courseIds: string[]) => api.addListItems(id!, courseIds),
    onSuccess: (l) => {
      swap(l);
      setPicking(false);
    },
    onError: complain,
  });
  const removeMut = useMutation({
    mutationFn: (courseId: string) => api.removeListItem(id!, courseId),
    onSuccess: swap,
    onError: complain,
  });
  const saveMut = useMutation({
    mutationFn: () => api.toggleListSave(id!),
    onSuccess: (res) =>
      queryClient.setQueryData<CourseCollectionDetail>(key, (prev) =>
        prev
          ? { ...prev, saved: res.saved, savesCount: Math.max(0, prev.savesCount + (res.saved ? 1 : -1)) }
          : prev,
      ),
    onError: complain,
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteList(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
      router.replace("/lists");
    },
    onError: complain,
  });

  const confirmDelete = () =>
    Alert.alert("Delete this list?", "The list goes, the courses stay in the catalogue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() },
    ]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {(error as Error | null)?.message || "Could not load this list. It may be private or deleted."}
        </Text>
      </View>
    );
  }

  const list = data;
  const items = list.items ?? [];
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: list.name }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            <Text style={styles.heading}>{list.name}</Text>
            {list.description ? <Text style={styles.desc}>{list.description}</Text> : null}
            <Text style={styles.muted}>
              {list.isOwner ? "yours" : `by ${list.ownerName}`} · {list.visibility} · {list.itemCount}{" "}
              {list.itemCount === 1 ? "course" : "courses"} · {list.savesCount} saves
            </Text>
            <View style={styles.actions}>
              {list.isOwner ? (
                <>
                  <Pressable style={styles.primaryBtn} onPress={() => setPicking(true)}>
                    <Text style={styles.primaryLabel}>＋ Add courses</Text>
                  </Pressable>
                  <Pressable style={styles.ghostBtn} onPress={() => setEditing(true)}>
                    <Text style={styles.ghostLabel}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.ghostBtn} onPress={confirmDelete} disabled={deleteMut.isPending}>
                    <Text style={[styles.ghostLabel, { color: colors.danger }]}>
                      {deleteMut.isPending ? "Deleting…" : "Delete"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.primaryBtn, list.saved && styles.savedBtn]}
                  onPress={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                >
                  <Text style={[styles.primaryLabel, list.saved && styles.savedLabel]}>
                    {list.saved ? "✓ Saved" : "Save list"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 36 }}>🗂️</Text>
            <Text style={styles.centered}>
              {list.isOwner
                ? "Nothing in here yet. Add a course from the catalogue and the list starts to mean something."
                : "This list is empty."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/courses/${item.slug}`)}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={{ color: colors.dim, fontSize: 14 }}>▶</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.title}
                </Text>
                <Text style={styles.muted}>
                  {item.ratingCount > 0 ? `★ ${item.ratingAvg.toFixed(1)} · ` : ""}
                  {item.level}
                </Text>
              </View>
              {list.isOwner ? (
                <Pressable hitSlop={10} onPress={() => removeMut.mutate(item.id)} disabled={removeMut.isPending}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.dim }}>›</Text>
              )}
            </Pressable>
          );
        }}
      />
      <CoursePickerSheet
        visible={picking}
        already={items.map((i) => i.id)}
        busy={addMut.isPending}
        onClose={() => setPicking(false)}
        onAdd={(courseIds) => addMut.mutate(courseIds)}
      />

      {/* Mounted only while open so the fields seed from the list as it is now. */}
      {editing && <EditListSheet list={list} onClose={() => setEditing(false)} onSaved={swap} />}
    </View>
  );
}

/**
 * Rename, re-describe, or flip a list between private and public. The PATCH sends
 * the description even when blank — that is how you clear one — but never a blank
 * name, which the API rejects outright.
 */
function EditListSheet({
  list,
  onClose,
  onSaved,
}: {
  list: CourseCollectionDetail;
  onClose: () => void;
  onSaved: (l: CourseCollectionDetail) => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(list.visibility);

  const mut = useMutation({
    mutationFn: () =>
      api.updateList(list.id, { name: name.trim(), description: description.trim(), visibility }),
    onSuccess: (l) => {
      onSaved(l);
      onClose();
    },
    onError: (e) => Alert.alert("List", (e as Error).message || "Could not save those changes."),
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit list</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.done}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="List name"
              placeholderTextColor={colors.dim}
            />

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What belongs in this list? (optional)"
              placeholderTextColor={colors.dim}
              multiline
            />

            <Text style={styles.label}>VISIBILITY</Text>
            <View style={styles.segmented}>
              {(["private", "public"] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.segment, visibility === v && styles.segmentActive]}
                  onPress={() => setVisibility(v)}
                >
                  <Text style={[styles.segmentLabel, visibility === v && styles.segmentLabelActive]}>
                    {v === "private" ? "🔒 Private" : "🌐 Public"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.muted, { marginTop: 6 }]}>
              {visibility === "private" ? "Only you can see this list." : "Anyone with the link can see this list."}
            </Text>

            <Pressable
              style={[styles.primaryBtn, { marginTop: 18 }, (!name.trim() || mut.isPending) && { opacity: 0.4 }]}
              disabled={!name.trim() || mut.isPending}
              onPress={() => mut.mutate()}
            >
              <Text style={styles.primaryLabel}>{mut.isPending ? "Saving…" : "Save changes"}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 40, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.bg },
  muted: { color: colors.muted, fontSize: 12 },
  centered: { color: colors.muted, fontSize: 13, textAlign: "center" },
  heading: { color: colors.text, fontSize: 22, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
  },
  thumb: { width: 40, height: 56, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  remove: { color: colors.dim, fontSize: 15, fontWeight: "800", paddingHorizontal: 6 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  primaryLabel: { color: "#000", fontWeight: "800", fontSize: 13 },
  savedBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  savedLabel: { color: colors.accent },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  ghostLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  label: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 6,
  },
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
  textarea: { minHeight: 70, textAlignVertical: "top" },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 9,
    alignItems: "center",
  },
  segmentActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segmentLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  segmentLabelActive: { color: colors.accent },
});
