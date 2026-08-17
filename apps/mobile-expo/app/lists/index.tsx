import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";

export default function ListsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-lists"],
    queryFn: api.myLists,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const createMut = useMutation({
    mutationFn: () => api.createList({ name: name.trim(), description: description.trim() || undefined, visibility }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setVisibility("private");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to see your lists</Text>
        <Link href="/auth" style={styles.signIn}>
          Sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={data ?? []}
        keyExtractor={(l) => l.id}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ fontSize: 40 }}>🗂️</Text>
            <Text style={styles.muted}>No lists yet</Text>
            <Text style={[styles.muted, { fontSize: 11 }]}>Create a list to organize the courses you want next.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.primaryLabel}>Create a list</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.count}>{data?.length ?? 0} lists</Text>
            <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.addLabel}>+ New list</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={`/lists/${item.id}`} asChild>
            <View style={styles.card}>
              <Text style={{ fontSize: 18 }}>{item.visibility === "public" ? "🌐" : "🔒"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.itemCount} courses · {item.visibility}
                  {item.description ? ` · ${item.description}` : ""}
                </Text>
              </View>
              <Text style={{ color: colors.dim }}>›</Text>
            </View>
          </Link>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New learning list</Text>
                <Pressable onPress={() => setShowCreate(false)}>
                  <Text style={styles.done}>Cancel</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Build my first product"
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
                <Pressable
                  style={[styles.segment, visibility === "private" && styles.segmentActive]}
                  onPress={() => setVisibility("private")}
                >
                  <Text style={[styles.segmentLabel, visibility === "private" && styles.segmentLabelActive]}>🔒 Private</Text>
                </Pressable>
                <Pressable
                  style={[styles.segment, visibility === "public" && styles.segmentActive]}
                  onPress={() => setVisibility("public")}
                >
                  <Text style={[styles.segmentLabel, visibility === "public" && styles.segmentLabelActive]}>🌐 Public</Text>
                </Pressable>
              </View>
              <Text style={[styles.muted, { fontSize: 11, marginTop: 6 }]}>
                {visibility === "private" ? "Only you can see this list." : "Anyone with the link can see this list."}
              </Text>

              <Pressable
                style={[styles.primaryBtn, { marginTop: 18 }, (!name.trim() || createMut.isPending) && { opacity: 0.4 }]}
                disabled={!name.trim() || createMut.isPending}
                onPress={() => createMut.mutate()}
              >
                <Text style={styles.primaryLabel}>{createMut.isPending ? "Creating…" : "Create list"}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 30 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  signIn: { color: colors.accent, fontWeight: "700", marginTop: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  count: { color: colors.muted, fontSize: 13 },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addLabel: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 14,
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  done: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  label: { color: colors.dim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 12, marginBottom: 6 },
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
