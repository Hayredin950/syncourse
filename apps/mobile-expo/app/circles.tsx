import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { CoursePickerSheet } from "../components/CoursePickerSheet";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import type { ActivityItem, CircleDetail, CircleLite, CircleMember, CourseSummary } from "../lib/types";

export default function CirclesScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { token } = useAuth();
  const signedIn = !!token;
  const [view, setView] = useState<"activity" | "circles">("activity");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const activityQ = useQuery({ queryKey: ["activity-feed"], queryFn: api.activityFeed });
  const circlesQ = useQuery({ queryKey: ["circles"], queryFn: api.circles });
  // Keyed on the id rather than fetched in the row's press handler: `joined`,
  // `isOwner` and `canPost` are all per-viewer, so the pane has to be able to
  // reload once the token lands or a member opens it without a composer.
  const detailQ = useQuery({
    queryKey: ["circle-detail", openId],
    queryFn: () => api.circleDetail(openId!),
    enabled: !!openId,
  });

  // The token arrives a tick after the first render, and everything per-viewer
  // was resolved without it. Signing out clears the cache outright, so only the
  // arrival needs handling here.
  useEffect(() => {
    if (!token) return;
    queryClient.invalidateQueries({ queryKey: ["circles"] });
    queryClient.invalidateQueries({ queryKey: ["circle-detail"] });
    queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
  }, [token, queryClient]);

  const needAuth = () => {
    setOpenId(null);
    router.push("/auth");
  };

  /** Every circle mutation answers with the whole refreshed circle. */
  const swap = (c: CircleDetail) => {
    queryClient.setQueryData(["circle-detail", c.id], c);
    queryClient.invalidateQueries({ queryKey: ["circles"] });
  };
  const complain = (e: unknown) => Alert.alert("Circles", (e as Error).message || "That didn't work.");
  const createMut = useMutation({
    mutationFn: () => api.createCircle({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (c) => {
      setName("");
      setDescription("");
      setShowCreate(false);
      setView("circles");
      queryClient.setQueryData(["circle-detail", c.id], c);
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      // Open it: a circle you cannot see the wall of is just a row in a list.
      setOpenId(c.id);
    },
    onError: complain,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["circles"] });
    queryClient.invalidateQueries({ queryKey: ["circle-detail"] });
    queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
  };
  const joinMut = useMutation({
    mutationFn: (id: string) => api.joinCircle(id),
    onSuccess: refreshAll,
    onError: complain,
  });
  const leaveMut = useMutation({
    mutationFn: (id: string) => api.leaveCircle(id),
    onSuccess: refreshAll,
    // The API refuses to let an owner leave — it would strand the circle — and
    // says so in the message, which is more use than anything invented here.
    onError: complain,
  });
  const destroyMut = useMutation({
    mutationFn: (id: string) => api.deleteCircle(id),
    onSuccess: () => {
      setOpenId(null);
      refreshAll();
    },
    onError: complain,
  });

  const confirmDestroy = (c: CircleDetail) =>
    Alert.alert(`Delete “${c.name}”?`, "Its wall and its membership go with it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => destroyMut.mutate(c.id) },
    ]);

  const circles = circlesQ.data ?? [];
  const detail = detailQ.data;
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
            <Pressable style={styles.createCard} onPress={() => (signedIn ? setShowCreate(true) : needAuth())}>
              <Text style={styles.createPlus}>＋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.createTitle}>
                  {circles.length > 0 ? "Start another circle" : "Start your first circle"}
                </Text>
                <Text style={styles.muted}>Gather a group around one learning goal.</Text>
              </View>
              <Text style={{ color: colors.dim }}>›</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <Text style={[styles.muted, { textAlign: "center", paddingVertical: 24 }]}>
              No circles yet. The first one can be yours.
            </Text>
          }
          renderItem={({ item }) => (
            <CircleRow
              circle={item}
              onOpen={() => setOpenId(item.id)}
              onJoin={() => (signedIn ? joinMut.mutate(item.id) : needAuth())}
              onLeave={() => leaveMut.mutate(item.id)}
            />
          )}
        />
      )}
      <Modal visible={!!openId} transparent animationType="slide" onRequestClose={() => setOpenId(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpenId(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {detail ? (
              // Keyed on the circle so a half-typed post never follows you into
              // the next circle you open.
              <CirclePane
                key={detail.id}
                circle={detail}
                signedIn={signedIn}
                busy={joinMut.isPending || leaveMut.isPending}
                onClose={() => setOpenId(null)}
                onToggleJoin={() =>
                  !signedIn ? needAuth() : detail.joined ? leaveMut.mutate(detail.id) : joinMut.mutate(detail.id)
                }
                onDestroy={() => confirmDestroy(detail)}
                onChanged={swap}
              />
            ) : (
              <View style={styles.center}>
                {detailQ.error ? (
                  <Text style={styles.muted}>{(detailQ.error as Error).message}</Text>
                ) : (
                  <ActivityIndicator color={colors.accent} />
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Start a circle</Text>
              <Pressable onPress={() => setShowCreate(false)} hitSlop={10}>
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

/**
 * One circle: its header, its wall, its members, and the activity its members
 * generated elsewhere. The wall is the part that makes a circle a place rather
 * than a mirror — everything else here you could see from the outside.
 *
 * Every mutation hands back the whole refreshed circle, so `onChanged` replaces
 * it in one go instead of this component patching counts by hand and slowly
 * drifting out of step with the server.
 */
function CirclePane({
  circle,
  signedIn,
  busy,
  onClose,
  onToggleJoin,
  onDestroy,
  onChanged,
}: {
  circle: CircleDetail;
  signedIn: boolean;
  busy: boolean;
  onClose: () => void;
  onToggleJoin: () => void;
  onDestroy: () => void;
  onChanged: (c: CircleDetail) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<CourseSummary | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [editing, setEditing] = useState(false);

  const complain = (e: unknown) => Alert.alert("Circles", (e as Error).message || "That didn't work.");

  const postMut = useMutation({
    mutationFn: () => api.createCirclePost(circle.id, text.trim(), attached?.id),
    onSuccess: (c) => {
      setText("");
      setAttached(null);
      onChanged(c);
    },
    onError: complain,
  });
  const deletePostMut = useMutation({
    mutationFn: (postId: string) => api.deleteCirclePost(circle.id, postId),
    onSuccess: onChanged,
    onError: complain,
  });
  const kickMut = useMutation({
    mutationFn: (memberId: string) => api.removeCircleMember(circle.id, memberId),
    onSuccess: onChanged,
    onError: complain,
  });

  const confirmKick = (m: CircleMember) =>
    Alert.alert(`Remove ${m.name}?`, "They can join again while the circle exists.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => kickMut.mutate(m.id) },
    ]);

  /** Pushing from inside the sheet would land the course behind it. */
  const openCourse = (slug: string) => {
    onClose();
    router.push(`/courses/${slug}`);
  };

  return (
    <>
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetTitle}>{circle.name}</Text>
          <Text style={styles.muted}>
            {circle.memberCount} {circle.memberCount === 1 ? "member" : "members"} · {circle.postCount}{" "}
            {circle.postCount === 1 ? "post" : "posts"} · by {circle.owner.name}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.done}>Close</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {circle.description ? <Text style={styles.sheetDesc}>{circle.description}</Text> : null}

        <View style={styles.actions}>
          {/* The owner is always a member, so Join/Leave would be a dead control. */}
          {circle.isOwner ? (
            <>
              <Pressable style={styles.ghostPill} onPress={() => setEditing(true)}>
                <Text style={styles.ghostPillLabel}>Edit</Text>
              </Pressable>
              <Pressable style={styles.ghostPill} onPress={onDestroy}>
                <Text style={[styles.ghostPillLabel, { color: colors.danger }]}>Delete circle</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.joinBtn, circle.joined && styles.joinBtnJoined]}
              onPress={onToggleJoin}
              disabled={busy}
            >
              <Text style={[styles.joinLabel, circle.joined && styles.joinLabelJoined]}>
                {busy ? "…" : circle.joined ? "Leave circle" : "Join circle"}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.label}>WALL</Text>
        {circle.canPost ? (
          <View style={styles.composer}>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={text}
              onChangeText={setText}
              placeholder="Share something with the circle…"
              placeholderTextColor={colors.dim}
              maxLength={2000}
              multiline
            />
            {attached ? (
              <View style={styles.attached}>
                <Text style={styles.attachedTitle} numberOfLines={1}>
                  ▶ {attached.title}
                </Text>
                <Pressable onPress={() => setAttached(null)} hitSlop={10}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <Pressable style={styles.ghostPill} onPress={() => setAttaching(true)}>
                <Text style={styles.ghostPillLabel}>
                  {attached ? "Change course" : "＋ Recommend a course"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.postBtn, (!text.trim() || postMut.isPending) && { opacity: 0.4 }]}
                disabled={!text.trim() || postMut.isPending}
                onPress={() => postMut.mutate()}
              >
                <Text style={styles.primaryLabel}>{postMut.isPending ? "Posting…" : "Post"}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>
            {signedIn ? "Join this circle to post on its wall." : "Sign in and join to post on this wall."}
          </Text>
        )}
        {circle.posts.length === 0 ? (
          <Text style={[styles.muted, { marginTop: 14 }]}>
            {circle.canPost ? "Nothing on the wall yet. Say the first thing." : "Nothing on the wall yet."}
          </Text>
        ) : (
          circle.posts.map((p) => {
            // Captured so the narrowing survives into the press handler below.
            const course = p.course;
            const avatar = cloudinaryUrl(p.author.avatarUrl, { width: 72, height: 72 });
            return (
              <View key={p.id} style={styles.post}>
                <View style={styles.postHead}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.postAvatar} />
                  ) : (
                    <View style={[styles.postAvatar, styles.memberFallback]}>
                      <Text style={styles.postInitial}>{p.author.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.author.name}</Text>
                    <Text style={styles.muted}>{formatWhen(p.createdAt)}</Text>
                  </View>
                  {/* The API decides: author or circle owner. */}
                  {p.canDelete ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => deletePostMut.mutate(p.id)}
                      disabled={deletePostMut.isPending}
                    >
                      <Text style={styles.remove}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.postBody}>{p.body}</Text>
                {course ? (
                  <Pressable style={styles.postCourse} onPress={() => openCourse(course.slug)}>
                    <Text style={styles.postCourseEyebrow}>RECOMMENDED</Text>
                    <Text style={styles.postCourseTitle} numberOfLines={2}>
                      {course.title}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
        <Text style={styles.label}>MEMBERS</Text>
        <View style={styles.memberRow}>
          {circle.members.map((m) => {
            const avatar = cloudinaryUrl(m.avatarUrl, { width: 96, height: 96 });
            return (
              <View key={m.id} style={styles.member}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatar, styles.memberFallback]}>
                    <Text style={styles.memberInitial}>{m.name.charAt(0)}</Text>
                  </View>
                )}
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.name}
                  {m.role === "owner" ? " 👑" : ""}
                </Text>
                {circle.isOwner && m.role !== "owner" ? (
                  <Pressable onPress={() => confirmKick(m)} hitSlop={8} disabled={kickMut.isPending}>
                    <Text style={styles.kick}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        {circle.activity.length > 0 ? (
          <>
            <Text style={styles.label}>CIRCLE ACTIVITY</Text>
            <View style={{ gap: 8, paddingBottom: 10 }}>
              {circle.activity.map((a) => (
                <ActivityRow key={`${a.type}-${a.id}`} item={a} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      {/* Nested inside this sheet's Modal on purpose: two Modals presented as
          siblings fight over who is on top. */}
      {attaching ? (
        <CoursePickerSheet
          visible
          single
          heading="Recommend a course"
          already={[]}
          onClose={() => setAttaching(false)}
          onAdd={(_ids, courses) => {
            setAttached(courses[0] ?? null);
            setAttaching(false);
          }}
        />
      ) : null}
      {editing ? (
        <EditCircleSheet circle={circle} onClose={() => setEditing(false)} onSaved={onChanged} />
      ) : null}
    </>
  );
}

/** Rename or re-describe a circle. Owner-only, enforced by the API either way. */
function EditCircleSheet({
  circle,
  onClose,
  onSaved,
}: {
  circle: CircleDetail;
  onClose: () => void;
  onSaved: (c: CircleDetail) => void;
}) {
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description ?? "");

  const mut = useMutation({
    mutationFn: () => api.updateCircle(circle.id, { name: name.trim(), description: description.trim() }),
    onSuccess: (c) => {
      onSaved(c);
      onClose();
    },
    onError: (e) => Alert.alert("Circles", (e as Error).message || "Could not save those changes."),
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit circle</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.done}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Circle name"
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
              style={[styles.primaryBtn, (!name.trim() || mut.isPending) && { opacity: 0.4 }]}
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
function CircleRow({
  circle,
  onOpen,
  onJoin,
  onLeave,
}: {
  circle: CircleLite;
  onOpen: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.circleCard}>
      <Pressable style={{ flex: 1 }} onPress={onOpen}>
        <Text style={styles.circleName}>{circle.name}</Text>
        <Text style={styles.muted} numberOfLines={2}>
          {circle.description ?? `A circle run by ${circle.owner.name}`}
        </Text>
        <Text style={[styles.muted, { fontSize: 10, marginTop: 4 }]}>
          {circle.memberCount} {circle.memberCount === 1 ? "member" : "members"} · {circle.postCount}{" "}
          {circle.postCount === 1 ? "post" : "posts"}
        </Text>
      </Pressable>
      {/* An owner cannot leave their own circle, so it reads as a plain badge. */}
      {circle.isOwner ? (
        <View style={[styles.joinBtn, styles.joinBtnJoined]}>
          <Text style={styles.joinLabelJoined}>Yours</Text>
        </View>
      ) : (
        <Pressable
          style={[styles.joinBtn, circle.joined && styles.joinBtnJoined]}
          onPress={circle.joined ? onLeave : onJoin}
        >
          <Text style={[styles.joinLabel, circle.joined && styles.joinLabelJoined]}>
            {circle.joined ? "Joined" : "Join"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}
/**
 * One line of "who did what". Split out of the feed so a circle's own activity
 * can be mapped inside the detail sheet's ScrollView — a FlatList nested in a
 * ScrollView loses its virtualisation and warns about it.
 */
function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>
          <Text style={styles.name}>{item.userName}</Text> {item.type === "review" ? "reviewed" : "downloaded"}{" "}
          <Link href={`/courses/${item.course.slug}`} style={styles.target}>
            {item.course.title}
          </Link>
        </Text>
        {item.body ? (
          <Text style={[styles.muted, { marginTop: 2 }]} numberOfLines={2}>
            “{item.body}”
          </Text>
        ) : null}
        <Text style={styles.muted}>{formatWhen(item.createdAt)}</Text>
      </View>
    </View>
  );
}

function ActivityList({ data, loading }: { data: ActivityItem[]; loading: boolean }) {
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
      keyExtractor={(a) => `${a.type}-${a.id}`}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <ActivityRow item={item} />}
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
  name: { color: colors.text, fontWeight: "700", fontSize: 13 },
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
  joinLabelJoined: { color: colors.accent, fontSize: 12, fontWeight: "700" },

  // sheets
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    maxHeight: "88%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sheetDesc: { color: "rgba(244,244,245,0.75)", fontSize: 13, lineHeight: 19, marginTop: 6 },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  label: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 8,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" },
  ghostPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ghostPillLabel: { color: colors.text, fontSize: 12, fontWeight: "700" },
  // wall
  composer: { gap: 8 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  postBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 9,
    marginLeft: "auto",
  },
  attached: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachedTitle: { color: colors.accent, fontSize: 12, fontWeight: "700", flex: 1 },
  remove: { color: colors.dim, fontSize: 14, fontWeight: "800", paddingHorizontal: 4 },
  post: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12, marginTop: 10, gap: 8 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  postInitial: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  postBody: { color: colors.text, fontSize: 13, lineHeight: 19 },
  postCourse: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
  },
  postCourseEyebrow: { color: colors.dim, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  postCourseTitle: { color: colors.accent, fontSize: 13, fontWeight: "700", marginTop: 3 },

  // members
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  member: { alignItems: "center", width: 62 },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceRaised },
  memberFallback: { alignItems: "center", justifyContent: "center" },
  memberInitial: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  memberName: { color: colors.text, fontSize: 11, marginTop: 4 },
  kick: { color: colors.danger, fontSize: 10, fontWeight: "700", marginTop: 2 },

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
});
