import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Confirm } from "../../components/Confirm";
import { CoursePickerSheet } from "../../components/CoursePickerSheet";
import { Empty, Failed } from "../../components/Empty";
import { Note, Toast, useToast } from "../../components/Note";
import { Press } from "../../components/Press";
import { Sheet } from "../../components/Sheet";
import { SkRows } from "../../components/Skeleton";
import { Text, TextInput } from "../../components/Type";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { plural, type CourseCollectionDetail } from "../../lib/types";

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
  const [deleting, setDeleting] = useState(false);
  const { note, say } = useToast();
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: key,
    queryFn: () => api.listDetail(id!),
    enabled: !!id,
  });

  const swap = (l: CourseCollectionDetail) => {
    queryClient.setQueryData(key, l);
    // The Lists tab prints a course count per row, so it goes stale with this.
    queryClient.invalidateQueries({ queryKey: ["my-lists"] });
  };
  /* Was `Alert.alert("List", …)` — a dialog titled with the noun rather than the
     problem, and a no-op in the browser build, where `Alert` is an empty
     function. Now it is a toast docked to the page. */
  const complain = (e: unknown) => say((e as Error).message || "That didn't work.", true);
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
    onError: (e) => {
      setDeleting(false);
      complain(e);
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={6} thumb={40} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <Failed
        title="Could not load this list"
        body={(error as Error | null)?.message || "It may be private, or it may have been deleted."}
        onRetry={() => refetch()}
      />
    );
  }
  const list = data;
  const items = list.items ?? [];
  const meta = [
    list.isOwner ? "Yours" : `By ${list.ownerName}`,
    list.visibility,
    plural(list.itemCount, "course"),
    plural(list.savesCount, "save"),
  ].join(" · ");

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: list.name }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.heading}>{list.name}</Text>
            {!!list.description && <Text style={styles.desc}>{list.description}</Text>}
            <Text style={styles.muted}>{meta}</Text>
            <View style={styles.actions}>
              {list.isOwner ? (
                <>
                  <Press style={styles.primaryBtn} onPress={() => setPicking(true)} accessibilityLabel="Add courses">
                    <Ionicons name="add" size={16} color={colors.onAccent} />
                    <Text style={styles.primaryLabel}>Add courses</Text>
                  </Press>
                  <Press style={styles.ghostBtn} onPress={() => setEditing(true)} accessibilityLabel="Edit this list">
                    <Ionicons name="create-outline" size={15} color={colors.text} />
                    <Text style={styles.ghostLabel}>Edit</Text>
                  </Press>
                  <Press
                    style={styles.ghostBtn}
                    onPress={() => setDeleting(true)}
                    disabled={deleteMut.isPending}
                    haptic="warning"
                    accessibilityLabel="Delete this list"
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={[styles.ghostLabel, styles.dangerLabel]}>
                      {deleteMut.isPending ? "Deleting…" : "Delete"}
                    </Text>
                  </Press>
                </>
              ) : (
                <Press
                  style={[styles.primaryBtn, list.saved && styles.savedBtn]}
                  onPress={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                  haptic
                  accessibilityLabel={list.saved ? "Remove this list from your saves" : "Save this list"}
                  accessibilityState={{ selected: list.saved }}
                >
                  <Ionicons
                    name={list.saved ? "checkmark" : "bookmark-outline"}
                    size={15}
                    color={list.saved ? colors.accent : colors.onAccent}
                  />
                  <Text style={[styles.primaryLabel, list.saved && styles.savedLabel]}>
                    {list.saved ? "Saved" : "Save list"}
                  </Text>
                </Press>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            icon="albums-outline"
            title={list.isOwner ? "Nothing in here yet" : "This list is empty"}
            body={
              list.isOwner
                ? "Add a course from the catalogue and the list starts to mean something."
                : undefined
            }
            action={list.isOwner ? { label: "Add courses", onPress: () => setPicking(true) } : undefined}
          />
        }
        renderItem={({ item }) => {
          const thumb = cloudinaryUrl(item.thumbnailUrl, { width: 120, height: 168 });
          return (
            <Press
              style={styles.card}
              onPress={() => router.push(`/courses/${item.slug}`)}
              accessibilityLabel={item.title}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Ionicons name="school-outline" size={16} color={colors.dim} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.title}
                </Text>
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
              </View>
              {list.isOwner ? (
                // Was a bare "✕" glyph with a 15px line box for a tap target.
                <Press
                  style={styles.remove}
                  onPress={() => removeMut.mutate(item.id)}
                  disabled={removeMut.isPending}
                  haptic="warning"
                  accessibilityLabel={`Remove ${item.title} from this list`}
                >
                  <Ionicons name="close" size={17} color={colors.muted} />
                </Press>
              ) : (
                <Ionicons name="chevron-forward" size={17} color={colors.dim} />
              )}
            </Press>
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

      <Confirm
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${list.name}”?`}
        body="The list goes. The courses stay in the catalogue, and anyone who saved this list loses it."
        confirmLabel="Delete list"
        pendingLabel="Deleting…"
        pending={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />

      <Toast note={note} />
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
    /* Was `Alert.alert("List", …)` — thrown on top of the sheet that asked for
       the change, and silent on web. It prints in the sheet now, under the field
       it is usually about. */
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit list"
      subtitle={list.name}
      footer={
        <Press
          style={styles.saveBtn}
          disabled={!name.trim() || mut.isPending}
          onPress={() => mut.mutate()}
          haptic="success"
          accessibilityLabel="Save changes"
        >
          <Text style={styles.saveLabel}>{mut.isPending ? "Saving…" : "Save changes"}</Text>
        </Press>
      }
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="List name"
        placeholderTextColor={colors.dim}
        returnKeyType="next"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="What belongs in this list? (optional)"
        placeholderTextColor={colors.dim}
        multiline
      />

      <Text style={styles.label}>Visibility</Text>
      <View style={styles.segmented}>
        {(["private", "public"] as const).map((v) => (
          <Press
            key={v}
            style={[styles.segment, visibility === v && styles.segmentActive]}
            onPress={() => setVisibility(v)}
            accessibilityLabel={v === "private" ? "Private" : "Public"}
            accessibilityState={{ selected: visibility === v }}
          >
            <Ionicons
              name={v === "public" ? "globe-outline" : "lock-closed-outline"}
              size={14}
              color={visibility === v ? colors.accent : colors.muted}
            />
            <Text style={[styles.segmentLabel, visibility === v && styles.segmentLabelActive]}>
              {v === "private" ? "Private" : "Public"}
            </Text>
          </Press>
        ))}
      </View>
      <Text style={styles.hint}>
        {visibility === "private"
          ? "Only you can see this list."
          : "Anyone with the link can see this list."}
      </Text>
      {!!mut.error && (
        <Note
          bad
          text={(mut.error as Error).message || "Could not save those changes."}
          style={styles.sheetNote}
        />
      )}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, gap: 10, paddingBottom: 40, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  head: { marginBottom: 4 },
  sheetNote: { marginTop: 14 },
  heading: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  desc: { color: colors.body, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  remove: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  primaryLabel: { color: colors.onAccent, fontWeight: "800", fontSize: 13 },
  savedBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  savedLabel: { color: colors.accent },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  ghostLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  dangerLabel: { color: colors.danger },
  label: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 7,
  },
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
  textarea: { minHeight: 76, textAlignVertical: "top", paddingTop: 11 },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  segmentActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segmentLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "700" },
  segmentLabelActive: { color: colors.accent },
  hint: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  saveBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  saveLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
});
