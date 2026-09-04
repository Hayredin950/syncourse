import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Sheet } from "../../components/Sheet";
import { SkRows } from "../../components/Skeleton";
import { Text, TextInput } from "../../components/Type";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import { plural } from "../../lib/types";

export default function ListsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["my-lists"],
    queryFn: api.myLists,
  });
  const router = useRouter();
  const { width } = useWindowDimensions();
  // A full-width card is a 1000px-wide row of 14px type on a tablet.
  const gutter = Math.max(16, Math.round((width - 720) / 2));
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const createMut = useMutation({
    mutationFn: () => api.createList({ name: name.trim(), description: description.trim() || undefined, visibility }),
    onSuccess: (created) => {
      setName("");
      setDescription("");
      setVisibility("private");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
      // Straight into the new list: a name and a description on their own are an
      // empty shelf, and the picker that fills it lives on the detail screen.
      router.push(`/lists/${created.id}`);
    },
  });
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={5} thumb={40} />
      </View>
    );
  }
  if (error) {
    // A 401 here is the common case — not a failure, just no account yet.
    return (error as api.ApiError).status === 401 ? (
      <Empty
        icon="person-circle-outline"
        title="Lists live with your account"
        body="Sign in to keep shelves of the courses you want next."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your lists" onRetry={() => refetch()} />
    );
  }

  const lists = data ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        data={lists}
        keyExtractor={(l) => l.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <Empty
            icon="albums-outline"
            title="No lists yet"
            body="A list is a shelf you fill yourself — the next five things you mean to watch, in the order you mean to watch them."
            action={{ label: "Create a list", onPress: () => setShowCreate(true) }}
          />
        }
        ListHeaderComponent={
          lists.length === 0 ? null : (
            <View style={styles.headerRow}>
              <Text style={styles.count}>{plural(lists.length, "list")}</Text>
              <Press style={styles.addBtn} onPress={() => setShowCreate(true)} accessibilityLabel="New list">
                <Ionicons name="add" size={15} color={colors.accent} />
                <Text style={styles.addLabel}>New list</Text>
              </Press>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Press
            style={styles.card}
            onPress={() => router.push(`/lists/${item.id}`)}
            accessibilityLabel={`${item.name}, ${plural(item.itemCount, "course")}, ${item.visibility}`}
          >
            {/* Was a bare 🌐/🔒 at 18px, which lands on a different baseline on
                every OS and can't take the palette's colours. */}
            <View style={styles.chip}>
              <Ionicons
                name={item.visibility === "public" ? "globe-outline" : "lock-closed-outline"}
                size={16}
                color={colors.accent}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {plural(item.itemCount, "course")} · {item.visibility}
              </Text>
              {!!item.description && (
                <Text style={styles.desc} numberOfLines={1}>
                  {item.description}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.dim} />
          </Press>
        )}
      />
      <Sheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="New learning list"
        subtitle="Name it now; fill it on the next screen."
        footer={
          <Press
            style={styles.primaryBtn}
            disabled={!name.trim() || createMut.isPending}
            onPress={() => createMut.mutate()}
            haptic="success"
            accessibilityLabel="Create list"
          >
            <Text style={styles.primaryLabel}>{createMut.isPending ? "Creating…" : "Create list"}</Text>
          </Press>
        }
      >
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Build my first product"
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
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  desc: { color: colors.dim, fontSize: 11.5 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  count: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  addLabel: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chip: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
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
  primaryBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
});
