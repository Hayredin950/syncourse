import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Confirm } from "../components/Confirm";
import { CoursePickerSheet } from "../components/CoursePickerSheet";
import { Empty, Failed } from "../components/Empty";
import { Note, Toast, useToast } from "../components/Note";
import { Press } from "../components/Press";
import { Sheet } from "../components/Sheet";
import { SkRows } from "../components/Skeleton";
import { Text, TextInput } from "../components/Type";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import {
  plural,
  type ActivityFeed,
  type ActivityItem,
  type CircleDetail,
  type CircleLite,
  type CircleMember,
  type CourseSummary,
} from "../lib/types";

export default function CirclesScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { token } = useAuth();
  const signedIn = !!token;
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));
  const [view, setView] = useState<"activity" | "circles">("activity");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /* Every failure on this screen used to be `Alert.alert("Circles", …)` — titled
     with the noun rather than the problem, and a no-op in the browser build,
     where react-native-web ships `Alert` as an empty function. */
  const { note, say } = useToast();

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
  const complain = (e: unknown) => say((e as Error).message || "That didn't work.", true);
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
    /* No `complain` here: the toast would be behind the create sheet's own
       modal window. It prints inside the sheet instead. */
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
    // The reason stays in the confirm sheet, which is still open.
  });

  const circles = circlesQ.data ?? [];
  const detail = detailQ.data;

  return (
    <View style={styles.screen}>
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <Text style={styles.eyebrow}>STUDY CIRCLES</Text>
        <Text style={styles.title}>Learn in public. Keep the signal.</Text>
        <View style={styles.pills}>
          {(["activity", "circles"] as const).map((v) => (
            <Press
              key={v}
              style={[styles.pill, view === v && styles.pillOn]}
              onPress={() => setView(v)}
              accessibilityLabel={v === "activity" ? "Activity" : "Circles"}
              accessibilityState={{ selected: view === v }}
            >
              <Ionicons
                name={v === "activity" ? "pulse-outline" : "people-outline"}
                size={14}
                color={view === v ? colors.accent : colors.muted}
              />
              <Text style={[styles.pillLabel, view === v && styles.pillLabelOn]}>
                {v === "activity" ? "Activity" : "Circles"}
              </Text>
            </Press>
          ))}
        </View>
      </View>

      {view === "activity" ? (
        <ActivityList
          feed={activityQ.data}
          loading={activityQ.isLoading}
          error={activityQ.error}
          refreshing={activityQ.isRefetching}
          onRefresh={() => activityQ.refetch()}
          gutter={gutter}
          signedIn={signedIn}
        />
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.circleList, { paddingHorizontal: gutter }]}
          refreshControl={
            <RefreshControl
              refreshing={circlesQ.isRefetching}
              onRefresh={() => circlesQ.refetch()}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <Press
              style={styles.createCard}
              onPress={() => (signedIn ? setShowCreate(true) : needAuth())}
              accessibilityLabel={circles.length > 0 ? "Start another circle" : "Start your first circle"}
            >
              <View style={styles.createIcon}>
                <Ionicons name="add" size={20} color={colors.accent} />
              </View>
              <View style={styles.grow}>
                <Text style={styles.createTitle}>
                  {circles.length > 0 ? "Start another circle" : "Start your first circle"}
                </Text>
                <Text style={styles.muted}>Gather a group around one learning goal.</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Press>
          }
          ListEmptyComponent={
            // The circles list had no loading state at all: it rendered as empty
            // first, so "No circles yet" flashed before the circles arrived.
            circlesQ.isLoading ? (
              <SkRows n={4} thumb={40} />
            ) : circlesQ.error ? (
              <Failed title="Could not load the circles" onRetry={() => circlesQ.refetch()} />
            ) : (
              <Empty
                icon="people-outline"
                title="No circles yet"
                body="A circle is a group around one learning goal, with a wall to talk on. The first one can be yours."
              />
            )
          }
          renderItem={({ item }) => (
            <CircleRow
              circle={item}
              busy={joinMut.isPending || leaveMut.isPending}
              onOpen={() => setOpenId(item.id)}
              onJoin={() => (signedIn ? joinMut.mutate(item.id) : needAuth())}
              onLeave={() => leaveMut.mutate(item.id)}
            />
          )}
        />
      )}

      {/* Mounted only while a circle is open, so the pane's composer state dies
          with it rather than following you into the next circle. */}
      {!!openId && (
        <Sheet
          visible
          onClose={() => setOpenId(null)}
          title={detail?.name ?? "Circle"}
          subtitle={
            detail
              ? `${plural(detail.memberCount, "member")} · ${plural(detail.postCount, "post")} · by ${
                  detail.owner.name
                }`
              : undefined
          }
        >
          {detail ? (
            <CirclePane
              key={detail.id}
              circle={detail}
              signedIn={signedIn}
              busy={joinMut.isPending || leaveMut.isPending}
              onClose={() => setOpenId(null)}
              onToggleJoin={() =>
                !signedIn ? needAuth() : detail.joined ? leaveMut.mutate(detail.id) : joinMut.mutate(detail.id)
              }
              onDestroy={() => destroyMut.mutate(detail.id)}
              destroyPending={destroyMut.isPending}
              destroyError={destroyMut.error}
              problem={joinMut.error ?? leaveMut.error}
              onChanged={swap}
            />
          ) : detailQ.error ? (
            <Failed
              title="Could not open this circle"
              body={(detailQ.error as Error).message || "It may have been deleted."}
              onRetry={() => detailQ.refetch()}
            />
          ) : (
            <SkRows n={4} thumb={40} />
          )}
        </Sheet>
      )}

      <Sheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="Start a circle"
        subtitle="Name it now — the wall and the members come after."
        footer={
          <Press
            style={styles.primaryBtn}
            disabled={!name.trim() || createMut.isPending}
            onPress={() => createMut.mutate()}
            haptic="success"
            accessibilityLabel="Create circle"
          >
            <Text style={styles.primaryLabel}>{createMut.isPending ? "Creating…" : "Create circle"}</Text>
          </Press>
        }
      >
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. React deep-dive crew"
          placeholderTextColor={colors.dim}
          returnKeyType="next"
        />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="What will you study together? (optional)"
          placeholderTextColor={colors.dim}
          multiline
        />
        {!!createMut.error && (
          <Note
            bad
            text={(createMut.error as Error).message || "Could not start that circle."}
            style={styles.sheetNote}
          />
        )}
      </Sheet>

      <Toast note={note} />
    </View>
  );
}

/**
 * One circle: its wall, its members, and the activity its members generated
 * elsewhere. The wall is the part that makes a circle a place rather than a
 * mirror — everything else here you could see from the outside.
 *
 * Every mutation hands back the whole refreshed circle, so `onChanged` replaces
 * it in one go instead of this component patching counts by hand and slowly
 * drifting out of step with the server.
 *
 * It renders plain Views: the enclosing `Sheet` supplies the header, the close
 * button and the scroll, where this used to roll its own — a fixed panel with
 * `paddingBottom: 34` under the gesture bar and "Close" as a word of text.
 */
function CirclePane({
  circle,
  signedIn,
  busy,
  onClose,
  onToggleJoin,
  onDestroy,
  destroyPending,
  destroyError,
  problem,
  onChanged,
}: {
  circle: CircleDetail;
  signedIn: boolean;
  busy: boolean;
  onClose: () => void;
  onToggleJoin: () => void;
  onDestroy: () => void;
  destroyPending?: boolean;
  destroyError?: unknown;
  /** A refused join or leave. It belongs next to the pill that asked for it —
      the screen's own toast would render behind this sheet's modal window. */
  problem?: unknown;
  onChanged: (c: CircleDetail) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<CourseSummary | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [editing, setEditing] = useState(false);
  /* Three destructive actions live in this sheet, and each one used to be an
     `Alert` — which the browser build silently drops, and which throws the OS on
     top of the sheet on native. Each is now a `Confirm`, and each keeps its own
     failure, because a toast docked to the screen cannot be seen from in here. */
  const [kicking, setKicking] = useState<CircleMember | null>(null);
  const [deletingPost, setDeletingPost] = useState<string | null>(null);
  const [destroying, setDestroying] = useState(false);

  const postMut = useMutation({
    mutationFn: () => api.createCirclePost(circle.id, text.trim(), attached?.id),
    onSuccess: (c) => {
      setText("");
      setAttached(null);
      onChanged(c);
    },
    // Prints under the composer, where the words that failed to send still are.
  });
  const deletePostMut = useMutation({
    mutationFn: (postId: string) => api.deleteCirclePost(circle.id, postId),
    onSuccess: (c) => {
      setDeletingPost(null);
      onChanged(c);
    },
  });
  const kickMut = useMutation({
    mutationFn: (memberId: string) => api.removeCircleMember(circle.id, memberId),
    onSuccess: (c) => {
      setKicking(null);
      onChanged(c);
    },
  });

  /** Pushing from inside the sheet would land the course behind it. */
  const openCourse = (slug: string) => {
    onClose();
    router.push(`/courses/${slug}`);
  };

  return (
    <>
      {!!circle.description && <Text style={styles.sheetDesc}>{circle.description}</Text>}

      <View style={styles.actions}>
        {/* The owner is always a member, so Join/Leave would be a dead control. */}
        {circle.isOwner ? (
          <>
            <Press style={styles.ghostPill} onPress={() => setEditing(true)} accessibilityLabel="Edit this circle">
              <Ionicons name="create-outline" size={15} color={colors.text} />
              <Text style={styles.ghostPillLabel}>Edit</Text>
            </Press>
            <Press
              style={styles.ghostPill}
              onPress={() => setDestroying(true)}
              disabled={destroyPending}
              haptic="warning"
              accessibilityLabel="Delete this circle"
            >
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[styles.ghostPillLabel, styles.dangerLabel]}>
                {destroyPending ? "Deleting…" : "Delete circle"}
              </Text>
            </Press>
          </>
        ) : (
          <Press
            style={[styles.joinBtn, circle.joined && styles.leaveBtn]}
            onPress={onToggleJoin}
            disabled={busy}
            haptic
            accessibilityLabel={circle.joined ? "Leave this circle" : "Join this circle"}
            accessibilityState={{ selected: circle.joined }}
          >
            <Ionicons
              name={circle.joined ? "exit-outline" : "person-add"}
              size={15}
              color={circle.joined ? colors.text : colors.onAccent}
            />
            {/* Was a lone "…" while the request was in flight. */}
            <Text style={[styles.joinLabel, circle.joined && styles.leaveLabel]}>
              {busy ? "Working…" : circle.joined ? "Leave circle" : "Join circle"}
            </Text>
          </Press>
        )}
      </View>

      {!!problem && (
        <Note bad text={(problem as Error).message || "That didn't work."} style={styles.paneNote} />
      )}

      <Text style={styles.label}>Wall</Text>
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
          {!!attached && (
            <View style={styles.attached}>
              <Ionicons name="play-circle" size={16} color={colors.accent} />
              <Text style={styles.attachedTitle} numberOfLines={1}>
                {attached.title}
              </Text>
              <Press
                style={styles.iconBtn}
                onPress={() => setAttached(null)}
                accessibilityLabel="Remove the attached course"
              >
                <Ionicons name="close" size={15} color={colors.muted} />
              </Press>
            </View>
          )}
          <View style={styles.composerRow}>
            <Press
              style={styles.ghostPill}
              onPress={() => setAttaching(true)}
              accessibilityLabel={attached ? "Change the recommended course" : "Recommend a course"}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.text} />
              <Text style={styles.ghostPillLabel}>{attached ? "Change course" : "Recommend a course"}</Text>
            </Press>
            <Press
              style={styles.postBtn}
              disabled={!text.trim() || postMut.isPending}
              onPress={() => postMut.mutate()}
              haptic="success"
              accessibilityLabel="Post to the wall"
            >
              <Text style={styles.primaryLabel}>{postMut.isPending ? "Posting…" : "Post"}</Text>
            </Press>
          </View>
          {/* 2,000 is the API's cap, and nothing said so until the field stopped
              taking keystrokes. */}
          {text.length > 1600 && (
            <Text style={styles.counter}>{plural(2000 - text.length, "character")} left</Text>
          )}
          {!!postMut.error && (
            <Note bad text={(postMut.error as Error).message || "That post did not go up."} />
          )}
        </View>
      ) : (
        <Quiet
          icon="lock-closed-outline"
          text={signedIn ? "Join this circle to post on its wall." : "Sign in and join to post on this wall."}
        />
      )}

      {circle.posts.length === 0 ? (
        <Quiet icon="chatbubbles-outline" text="Nothing on the wall yet. The first post sets the tone." />
      ) : (
        circle.posts.map((p) => {
          const avatar = cloudinaryUrl(p.author.avatarUrl, { width: 72, height: 72 });
          return (
            <View key={p.id} style={styles.post}>
              <View style={styles.postHead}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.postAvatar} />
                ) : (
                  <View style={[styles.postAvatar, styles.center]}>
                    <Text style={styles.postInitial}>{p.author.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.grow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.author.name}
                  </Text>
                  <Text style={styles.muted}>{formatWhen(p.createdAt)}</Text>
                </View>
                {/* The API decides who may delete — author or owner — so this
                    never disagrees with what the request will allow. A post used
                    to vanish on a single tap of a 14px "✕" with nothing to
                    undo it, and on web the confirmation never appeared at all. */}
                {p.canDelete && (
                  <Press
                    style={styles.iconBtn}
                    onPress={() => setDeletingPost(p.id)}
                    disabled={deletePostMut.isPending}
                    haptic="warning"
                    accessibilityLabel="Delete this post"
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.muted} />
                  </Press>
                )}
              </View>
              <Text style={styles.postBody}>{p.body}</Text>
              {!!p.course && <PostCourse course={p.course} onOpen={openCourse} />}
            </View>
          );
        })
      )}

      <Text style={styles.label}>{plural(circle.memberCount, "member")}</Text>
      <View style={styles.memberRow}>
        {circle.members.map((m) => {
          const avatar = cloudinaryUrl(m.avatarUrl, { width: 88, height: 88 });
          const owner = m.role === "owner";
          return (
            <View key={m.id} style={styles.member}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.center]}>
                  <Text style={styles.memberInitial}>{m.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.memberName} numberOfLines={1}>
                {m.name}
              </Text>
              {/* Was a "👑", which reads as decoration rather than a role. */}
              {owner && <Text style={styles.ownerTag}>Owner</Text>}
              {circle.isOwner && !owner && (
                <Press
                  style={styles.kick}
                  onPress={() => setKicking(m)}
                  disabled={kickMut.isPending}
                  hitSlop={12}
                  haptic="warning"
                  accessibilityLabel={`Remove ${m.name} from this circle`}
                >
                  <Ionicons name="close" size={12} color={colors.onAccent} />
                </Press>
              )}
            </View>
          );
        })}
      </View>

      {/* The members' reviews and downloads from elsewhere in the app: proof the
          circle is a group of readers rather than a name with a wall. */}
      {circle.activity.length > 0 && (
        <>
          <Text style={styles.label}>Lately, elsewhere</Text>
          {circle.activity.map((a) => (
            <ActivityRow key={`${a.type}-${a.id}`} item={a} onOpen={openCourse} />
          ))}
        </>
      )}

      <CoursePickerSheet
        visible={attaching}
        already={[]}
        single
        heading="Recommend a course"
        onClose={() => setAttaching(false)}
        onAdd={(_ids, courses) => {
          setAttached(courses[0] ?? null);
          setAttaching(false);
        }}
      />

      {/* Mounted only while open so the fields seed from the circle as it is now. */}
      {editing && <EditCircleSheet circle={circle} onClose={() => setEditing(false)} onSaved={onChanged} />}

      <Confirm
        visible={!!deletingPost}
        onClose={() => setDeletingPost(null)}
        title="Delete this post?"
        body="It goes from the wall for everyone."
        confirmLabel="Delete post"
        pendingLabel="Deleting…"
        pending={deletePostMut.isPending}
        error={deletePostMut.error}
        onConfirm={() => deletingPost && deletePostMut.mutate(deletingPost)}
      />

      <Confirm
        visible={!!kicking}
        onClose={() => setKicking(null)}
        title={`Remove ${kicking?.name ?? "this member"}?`}
        body="They lose the wall straight away, and can join again while the circle exists."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={kickMut.isPending}
        error={kickMut.error}
        onConfirm={() => kicking && kickMut.mutate(kicking.id)}
      />

      <Confirm
        visible={destroying}
        onClose={() => setDestroying(false)}
        title={`Delete “${circle.name}”?`}
        body="The wall, its posts and the membership all go. The courses anyone recommended stay in the catalogue."
        confirmLabel="Delete circle"
        pendingLabel="Deleting…"
        pending={destroyPending}
        error={destroyError}
        onConfirm={onDestroy}
      />
    </>
  );
}

/** The course a post recommends, as a row you can actually get to. */
function PostCourse({
  course,
  onOpen,
}: {
  course: { title: string; slug: string; thumbnailUrl: string | null };
  onOpen: (slug: string) => void;
}) {
  const poster = cloudinaryUrl(course.thumbnailUrl, { width: 96, height: 134 });
  return (
    <Press style={styles.postCourse} onPress={() => onOpen(course.slug)} accessibilityLabel={`Open ${course.title}`}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.postCoursePoster} resizeMode="cover" />
      ) : (
        <View style={[styles.postCoursePoster, styles.center]}>
          <Ionicons name="school-outline" size={14} color={colors.dim} />
        </View>
      )}
      <View style={styles.grow}>
        <Text style={styles.postCourseEyebrow}>RECOMMENDED</Text>
        <Text style={styles.postCourseTitle} numberOfLines={2}>
          {course.title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.dim} />
    </Press>
  );
}

/**
 * A muted in-sheet notice. `Empty` is right for a whole screen — a 58px glyph and
 * 44px of air either side — but inside a sheet section it swamps the section it
 * is there to explain.
 */
function Quiet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.quiet}>
      <Ionicons name={icon} size={15} color={colors.dim} />
      <Text style={styles.quietText}>{text}</Text>
    </View>
  );
}

/**
 * Rename or re-describe a circle. The PATCH carries the description even when
 * blank — that is how one is cleared — but never a blank name, which the API
 * rejects outright.
 */
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
    /* Was an `Alert` thrown on top of the sheet that asked for the change, and
       silent in the browser build. It prints in the sheet now. */
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Edit circle"
      subtitle={circle.name}
      footer={
        <Press
          style={styles.primaryBtn}
          disabled={!name.trim() || mut.isPending}
          onPress={() => mut.mutate()}
          haptic="success"
          accessibilityLabel="Save changes"
        >
          <Text style={styles.primaryLabel}>{mut.isPending ? "Saving…" : "Save changes"}</Text>
        </Press>
      }
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Circle name"
        placeholderTextColor={colors.dim}
        returnKeyType="next"
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="What will you study together? (optional)"
        placeholderTextColor={colors.dim}
        multiline
      />
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

/**
 * One circle in the list: enough to decide whether to open it, plus the single
 * control that means anything from the outside. The owner gets a "Yours" tag
 * where a Join/Leave pill would only ever refuse.
 */
function CircleRow({
  circle,
  busy,
  onOpen,
  onJoin,
  onLeave,
}: {
  circle: CircleLite;
  busy: boolean;
  onOpen: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const meta = `${plural(circle.memberCount, "member")} · ${plural(circle.postCount, "post")} · by ${circle.owner.name}`;
  return (
    <Press style={styles.circleCard} onPress={onOpen} accessibilityLabel={`${circle.name}. ${meta}`}>
      <View style={styles.circleIcon}>
        <Ionicons name="people" size={17} color={colors.accent} />
      </View>
      <View style={styles.circleMain}>
        <Text style={styles.circleName} numberOfLines={1}>
          {circle.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {meta}
        </Text>
        {!!circle.description && (
          <Text style={styles.finePrint} numberOfLines={1}>
            {circle.description}
          </Text>
        )}
      </View>
      {circle.isOwner ? (
        <View style={styles.yours}>
          <Text style={styles.yoursLabel}>Yours</Text>
        </View>
      ) : (
        <Press
          style={[styles.joinPill, circle.joined && styles.joinPillOn]}
          onPress={circle.joined ? onLeave : onJoin}
          disabled={busy}
          haptic
          accessibilityLabel={circle.joined ? `Leave ${circle.name}` : `Join ${circle.name}`}
          accessibilityState={{ selected: circle.joined }}
        >
          <Ionicons
            name={circle.joined ? "checkmark" : "add"}
            size={14}
            color={circle.joined ? colors.accent : colors.onAccent}
          />
          <Text style={[styles.joinPillLabel, circle.joined && styles.joinPillLabelOn]}>
            {circle.joined ? "Joined" : "Join"}
          </Text>
        </Press>
      )}
    </Press>
  );
}

/**
 * "just now" up to a week, then the date. Both feeds used to print a raw
 * `toLocaleDateString`, so everything that happened today read as today's date
 * and nothing looked recent.
 */
function formatWhen(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, "day") + " ago";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One thing somebody did: who, what, and the course it happened to. */
function ActivityRow({ item, onOpen }: { item: ActivityItem; onOpen: (slug: string) => void }) {
  const avatar = cloudinaryUrl(item.userAvatar, { width: 72, height: 72 });
  const poster = cloudinaryUrl(item.course.thumbnailUrl, { width: 96, height: 134 });
  const verb = item.type === "review" ? "reviewed" : "downloaded";
  return (
    <Press
      style={styles.card}
      onPress={() => onOpen(item.course.slug)}
      accessibilityLabel={`${item.userName} ${verb} ${item.course.title}`}
    >
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.center]}>
          <Text style={styles.avatarText}>{item.userName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.body}>
        {/* Was "★ reviewed" / "⬇ downloaded" — two glyphs doing the work of a verb. */}
        <Text style={styles.name} numberOfLines={1}>
          {item.userName} <Text style={styles.muted}>{verb}</Text>
        </Text>
        <Text style={styles.target} numberOfLines={2}>
          {item.course.title}
        </Text>
        {!!item.body && (
          <Text style={styles.finePrint} numberOfLines={2}>
            “{item.body}”
          </Text>
        )}
        <Text style={styles.muted}>{formatWhen(item.createdAt)}</Text>
      </View>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" />
      ) : (
        <Ionicons name="chevron-forward" size={17} color={colors.dim} />
      )}
    </Press>
  );
}

/**
 * What the people you follow have been doing. A 401 here is the ordinary case for
 * a signed-out reader rather than a failure, and an empty feed with nobody
 * followed needs different words from an empty feed with twenty.
 */
function ActivityList({
  feed,
  loading,
  error,
  refreshing,
  onRefresh,
  gutter,
  signedIn,
}: {
  feed?: ActivityFeed;
  loading: boolean;
  error: unknown;
  refreshing: boolean;
  onRefresh: () => void;
  gutter: number;
  signedIn: boolean;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <View style={[styles.list, { paddingHorizontal: gutter }]}>
        <SkRows n={5} thumb={40} />
      </View>
    );
  }
  if (error) {
    return !signedIn || (error as api.ApiError).status === 401 ? (
      <Empty
        icon="person-circle-outline"
        title="Your feed lives with your account"
        body="Sign in to see what the people you follow are learning."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load the activity" onRetry={onRefresh} />
    );
  }

  return (
    <FlatList
      data={feed?.items ?? []}
      keyExtractor={(a) => `${a.type}-${a.id}`}
      contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
      ListEmptyComponent={
        // "No activity yet" was the answer to two different questions: nobody
        // followed, and nobody active. Only the first one has a next step.
        feed && feed.followingCount === 0 ? (
          <Empty
            icon="people-circle-outline"
            title="Follow someone first"
            body="This fills with the reviews and downloads of the people you follow."
            action={{ label: "Browse lecturers", href: "/lecturers" }}
          />
        ) : (
          <Empty
            icon="pulse-outline"
            title="Nothing new yet"
            body="When someone you follow reviews or downloads a course, it lands here."
          />
        )
      }
      renderItem={({ item }) => (
        <ActivityRow item={item} onOpen={(slug) => router.push(`/courses/${slug}`)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingTop: 10, paddingBottom: 14 },
  eyebrow: { color: colors.accent, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 27,
    marginTop: 5,
  },
  // Was two text links with a bare underline for the active one, which on a
  // phone is a 15px tap target that looks like body copy.
  pills: { flexDirection: "row", gap: 8, marginTop: 14 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pillLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "700" },
  pillLabelOn: { color: colors.accent },
  grow: { flex: 1, minWidth: 0, gap: 3 },
  center: { alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  finePrint: { color: colors.dim, fontSize: 11.5, lineHeight: 16 },
  list: { paddingBottom: 40, gap: 10, flexGrow: 1 },
  circleList: { paddingBottom: 40, gap: 10, flexGrow: 1 },

  // A dashed edge says "this makes a new one" without a second colour.
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  createIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  createTitle: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  circleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  circleIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  circleMain: { flex: 1, minWidth: 0, gap: 3 },
  circleName: { color: colors.text, fontSize: 14.5, fontWeight: "700" },

  yours: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  yoursLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  joinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  joinPillOn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  joinPillLabel: { color: colors.onAccent, fontSize: 12.5, fontWeight: "800" },
  joinPillLabelOn: { color: colors.accent },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  avatarText: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  target: { color: colors.body, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  poster: { width: 34, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  sheetDesc: { color: colors.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  sheetNote: { marginTop: 14 },
  paneNote: { marginTop: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" },

  ghostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostPillLabel: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
  dangerLabel: { color: colors.danger },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  leaveBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  joinLabel: { color: colors.onAccent, fontSize: 13.5, fontWeight: "800" },
  leaveLabel: { color: colors.text },
  label: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
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

  composer: { gap: 10 },
  composerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  postBtn: {
    minHeight: 40,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  counter: { color: colors.dim, fontSize: 11, textAlign: "right" },
  attached: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  attachedTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12.5, fontWeight: "600" },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  post: {
    gap: 9,
    padding: 13,
    marginBottom: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  postInitial: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  postBody: { color: colors.body, fontSize: 13.5, lineHeight: 20 },

  postCourse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  postCoursePoster: {
    width: 32,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  postCourseEyebrow: { color: colors.accent, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8 },
  postCourseTitle: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  member: { width: 70, alignItems: "center", gap: 5, paddingTop: 4 },
  memberAvatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  memberInitial: { color: colors.accent, fontSize: 16, fontWeight: "800" },
  memberName: { color: colors.body, fontSize: 11, textAlign: "center" },
  ownerTag: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  kick: {
    position: "absolute",
    top: 0,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  quiet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  quietText: { flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  primaryBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
});
