import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { DiscussionThread as Thread } from "../lib/types";

export function Discussion({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["discussion", slug],
    queryFn: () => api.discussion(slug),
  });

  const postMut = useMutation({
    mutationFn: () => api.postDiscussion(slug, text.trim()),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["discussion", slug] });
    },
  });

  const replyMut = useMutation({
    mutationFn: () => api.postDiscussion(slug, replyText.trim(), replyTo!),
    onSuccess: () => {
      setReplyText("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["discussion", slug] });
    },
  });

  const upvoteMut = useMutation({
    mutationFn: (id: string) => api.toggleUpvote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["discussion", slug] }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const threads = data?.threads ?? [];

  return (
    <View>
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Join the thread — ask a question or share a tip…"
          placeholderTextColor={colors.dim}
          multiline
          style={styles.input}
        />
        <Pressable
          style={[styles.postBtn, !text.trim() && { opacity: 0.4 }]}
          disabled={!text.trim() || postMut.isPending}
          onPress={() => postMut.mutate()}
        >
          <Text style={styles.postLabel}>{postMut.isPending ? "…" : "Post"}</Text>
        </Pressable>
      </View>

      {threads.length === 0 && (
        <Text style={styles.muted}>No replies yet — start the thread.</Text>
      )}

      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          onUpvote={() => upvoteMut.mutate(t.id)}
          onReply={() => setReplyTo(replyTo === t.id ? null : t.id)}
          replyOpen={replyTo === t.id}
          replyText={replyText}
          setReplyText={setReplyText}
          submitReply={() => replyMut.mutate()}
          replying={replyMut.isPending}
        />
      ))}
    </View>
  );
}

function ThreadRow({
  thread,
  onUpvote,
  onReply,
  replyOpen,
  replyText,
  setReplyText,
  submitReply,
  replying,
}: {
  thread: Thread;
  onUpvote: () => void;
  onReply: () => void;
  replyOpen: boolean;
  replyText: string;
  setReplyText: (t: string) => void;
  submitReply: () => void;
  replying: boolean;
}) {
  const [showSpoiler, setShowSpoiler] = useState(!thread.containsSpoilers);
  return (
    <View style={[styles.thread, thread.depth > 0 && styles.reply]}>
      <View style={styles.threadHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{thread.userName.charAt(0)}</Text>
        </View>
        <Text style={styles.userName} numberOfLines={1}>
          {thread.userName}
          {thread.isStaff ? " · STAFF" : ""}
        </Text>
        <Text style={styles.date}>
          {new Date(thread.createdAt).toLocaleDateString()}
        </Text>
      </View>

      {thread.containsSpoilers && !showSpoiler ? (
        <Pressable style={styles.spoilerBtn} onPress={() => setShowSpoiler(true)}>
          <Text style={styles.spoilerText}>This may contain spoilers — Show</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>{thread.body}</Text>
      )}

      <View style={styles.threadActions}>
        <Pressable style={styles.actionBtn} onPress={onUpvote}>
          <Text style={[styles.actionIcon, thread.upvoted && styles.upvoted]}>▲</Text>
          <Text style={[styles.actionLabel, thread.upvoted && styles.upvoted]}>
            {thread.upvotes}
          </Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onReply}>
          <Text style={styles.actionLabel}>Reply</Text>
        </Pressable>
      </View>

      {replyOpen && (
        <View style={styles.replyComposer}>
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder={`Reply to ${thread.userName}…`}
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
          <Pressable
            style={[styles.postBtn, !replyText.trim() && { opacity: 0.4 }]}
            disabled={!replyText.trim() || replying}
            onPress={submitReply}
          >
            <Text style={styles.postLabel}>{replying ? "…" : "Reply"}</Text>
          </Pressable>
        </View>
      )}

      {thread.replies?.map((r) => (
        <ThreadRow
          key={r.id}
          thread={r}
          onUpvote={() => {}}
          onReply={() => {}}
          replyOpen={false}
          replyText=""
          setReplyText={() => {}}
          submitReply={() => {}}
          replying={false}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 20, alignItems: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  composer: { marginBottom: 12 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 10,
    fontSize: 13,
    minHeight: 48,
    textAlignVertical: "top",
  },
  postBtn: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 6,
  },
  postLabel: { color: "#000", fontWeight: "800", fontSize: 12 },
  thread: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  reply: { marginLeft: 16, backgroundColor: colors.surfaceHover },
  threadHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  userName: { color: colors.text, fontSize: 12, fontWeight: "600", flex: 1 },
  date: { color: colors.dim, fontSize: 10 },
  spoilerBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 8,
    marginTop: 6,
  },
  spoilerText: { color: colors.muted, fontSize: 12, textAlign: "center" },
  body: { color: "rgba(244,244,245,0.8)", fontSize: 13, lineHeight: 18, marginTop: 6 },
  threadActions: { flexDirection: "row", gap: 16, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionIcon: { color: colors.muted, fontSize: 11 },
  actionLabel: { color: colors.muted, fontSize: 12 },
  upvoted: { color: colors.accent },
  replyComposer: { marginTop: 8 },
});
