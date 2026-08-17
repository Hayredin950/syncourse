import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { cloudinaryUrl } from "../lib/cloudinary";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { ActivityItem, CircleDetail, CircleLite } from "../lib/types";

export default function CirclesScreen() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"activity" | "circles">("activity");
  const [selected, setSelected] = useState<CircleLite | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const activityQ = useQuery({
    queryKey: ["activity-feed"],
    queryFn: api.activityFeed,
  });
  const circlesQ = useQuery({
    queryKey: ["circles"],
    queryFn: api.circles,
  });
  const detailQ = useQuery({
    queryKey: ["circle-detail", selected?.id],
    queryFn: () => api.circleDetail(selected!.id),
    enabled: !!selected?.id,
  });

  const createMut = useMutation({
    mutationFn: () => api.createCircle({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (c) => {
      setName("");
      setDescription("");
      setShowCreate(false);
      setSelected(c);
      setView("circles");
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
  });

  const joinMut = useMutation({
    mutationFn: (id: string) => api.joinCircle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      queryClient.invalidateQueries({ queryKey: ["circle-detail"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
    },
  });
  const leaveMut = useMutation({
    mutationFn: (id: string) => api.leaveCircle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      queryClient.invalidateQueries({ queryKey: ["circle-detail"] });
      queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
    },
  });

  const circles = circlesQ.data ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>STUDY CIRCLES</Text>
        <Text style={styles.title}>Learn in public. Keep the signal.</Text>
        <View style={styles.pills}>
          {(["activity", "circles"] as const).map((v) => (
            <Pressable key={v} style={[styles.pill, view === v && styles.pillActive]} onPress={() => setView(v)}>
              <Text style={[styles.pillLabel, view === v && styles.pillLabelActive]}>
                {v === "activity" ? "Activity" : "Circles"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === "activity" ? (
        <ActivityList data={activityQ.data?.items ?? []} loading={activityQ.isLoading} />
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.circleList}
          ListHeaderComponent={
            <Pressable style={styles.createCard} onPress={() => setShowCreate(true)}>
              <Text style={styles.createPlus}>＋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.createTitle}>Start your first circle</Text>
                <Text style={styles.muted}>Gather a group around one learning goal.</Text>
              </View>
              <Text style={{ color: colors.dim }}>›</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <CircleRow
              circle={item}
              onOpen={() => setSelected(item)}
              joined={item.joined}
              onJoin={() => joinMut.mutate(item.id)}
              onLeave={() => leaveMut.mutate(item.id)}
            />
          )}
        />
      )}

      {/* circle detail — renders once the full detail has loaded */}
      {detailQ.data && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{detailQ.data.name}</Text>
                  <Text style={styles.muted}>
                    {detailQ.data.memberCount} members · by {detailQ.data.ownerName}
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)}>
                  <Text style={styles.done}>Close</Text>
                </Pressable>
              </View>
              {detailQ.data.description ? <Text style={styles.sheetDesc}>{detailQ.data.description}</Text> : null}

              <Text style={styles.label}>MEMBERS</Text>
              <View style={styles.memberRow}>
                {detailQ.data.members.map((m) => (
                  <View key={m.id} style={styles.member}>
                    {m.avatarUrl ? (
                      <Image source={{ uri: cloudinaryUrl(m.avatarUrl, { width: 96, height: 96 }) ?? undefined }} style={styles.memberAvatar} />
                    ) : (
                      <View style={[styles.memberAvatar, styles.memberFallback]}>
                        <Text style={styles.memberInitial}>{m.name.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name}
                      {m.isOwner ? " 👑" : ""}
                    </Text>
                  </View>
                ))}
              </View>

              {detailQ.data.activity.length > 0 && (
                <>
                  <Text style={styles.label}>CIRCLE ACTIVITY</Text>
                  <ActivityList data={detailQ.data.activity} loading={false} compact />
                </>
              )}

              <Pressable
                style={[styles.primaryBtn, detailQ.data.joined && styles.ghostBtn]}
                onPress={() => (detailQ.data.joined ? leaveMut.mutate(detailQ.data.id) : joinMut.mutate(detailQ.data.id))}
                disabled={joinMut.isPending || leaveMut.isPending}
              >
                <Text style={[styles.primaryLabel, detailQ.data.joined && styles.ghostLabel]}>
                  {joinMut.isPending || leaveMut.isPending ? "…" : detailQ.data.joined ? "Leave circle" : "Join circle"}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Start a circle</Text>
              <Pressable onPress={() => setShowCreate(false)}>
                <Text style={styles.done}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. React deep-dive crew"
              placeholderTextColor={colors.dim}
            />
            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What will you study together? (optional)"
              placeholderTextColor={colors.dim}
              multiline
            />
            <Pressable
              style={[styles.primaryBtn, (!name.trim() || createMut.isPending) && { opacity: 0.4 }]}
              disabled={!name.trim() || createMut.isPending}
              onPress={() => createMut.mutate()}
            >
              <Text style={styles.primaryLabel}>{createMut.isPending ? "Creating…" : "Create circle"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CircleRow({
  circle,
  onOpen,
  joined,
  onJoin,
  onLeave,
}: {
  circle: CircleLite;
  onOpen: () => void;
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.circleCard}>
      <Pressable style={{ flex: 1 }} onPress={onOpen}>
        <Text style={styles.circleName}>{circle.name}</Text>
        <Text style={styles.muted} numberOfLines={2}>
          {circle.description ?? `${circle.memberCount} members learning together`}
        </Text>
        <Text style={[styles.muted, { fontSize: 10, marginTop: 4 }]}>{circle.memberCount} members</Text>
      </Pressable>
      <Pressable
        style={[styles.joinBtn, joined && styles.joinBtnJoined]}
        onPress={joined ? onLeave : onJoin}
      >
        <Text style={[styles.joinLabel, joined && styles.joinLabelJoined]}>{joined ? "Joined" : "Join"}</Text>
      </Pressable>
    </View>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function ActivityList({
  data,
  loading,
  compact,
}: {
  data: ActivityItem[];
  loading: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 40 }}>👥</Text>
        <Text style={styles.muted}>Follow people to see what they are learning</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={data}
      keyExtractor={(a) => a.id}
      contentContainerStyle={compact ? styles.compactList : styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.body}>
              <Text style={styles.name}>{item.userName}</Text>{" "}
              {item.type === "review" ? "reviewed" : "enrolled in"}{" "}
              <Link href={`/courses/${item.course.slug}`} style={styles.target}>
                {item.course.title}
              </Link>
            </Text>
            {item.body ? <Text style={[styles.muted, { marginTop: 2 }]} numberOfLines={2}>“{item.body}”</Text> : null}
            <Text style={styles.muted}>{formatWhen(item.createdAt)}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { padding: 16, paddingBottom: 4 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  pills: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  pillLabelActive: { color: "#000" },
  center: { padding: 40, alignItems: "center", gap: 10 },
  muted: { color: colors.muted, fontSize: 12 },
  list: { padding: 16, paddingBottom: 40, gap: 10 },
  compactList: { gap: 8, paddingBottom: 12 },
  card: { flexDirection: "row", gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  body: { color: "rgba(244,244,245,0.75)", fontSize: 13, lineHeight: 18 },
  name: { color: colors.text, fontWeight: "700" },
  target: { color: colors.accent, fontWeight: "600" },

  // circles list
  circleList: { padding: 16, paddingBottom: 40, gap: 10 },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 4,
  },
  createPlus: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  createTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  circleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  circleName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  joinBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  joinBtnJoined: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  joinLabel: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  joinLabelJoined: { color: colors.accent },

  // modals
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "88%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sheetDesc: { color: "rgba(244,244,245,0.75)", fontSize: 13, lineHeight: 19, marginTop: 6 },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  label: { color: colors.dim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 16, marginBottom: 8 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  member: { alignItems: "center", width: 62 },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceRaised },
  memberFallback: { alignItems: "center", justifyContent: "center" },
  memberInitial: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  memberName: { color: colors.text, fontSize: 11, marginTop: 4 },
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
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 18,
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
  ghostBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  ghostLabel: { color: colors.text },
});
