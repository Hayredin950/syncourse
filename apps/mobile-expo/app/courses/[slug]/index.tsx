import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Switch,
} from "react-native";
import * as api from "../../../lib/api";
import { colors, radius } from "../../../lib/tokens";
import { formatDurationSec, type CourseDetail } from "../../../lib/types";
import { Stars, StarPicker, StarRow } from "../../../components/StarRating";

export default function CourseDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => api.courseDetail(slug!),
  });

  const enrollMut = useMutation({
    mutationFn: () => api.enroll(slug!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const saveMut = useMutation({ mutationFn: () => api.toggleSave(slug!) });
  const likeMut = useMutation({ mutationFn: () => api.toggleLike(slug!) });
  const rateMut = useMutation({
    mutationFn: (stars: number) => api.rateCourse(slug!, stars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const reviewMut = useMutation({
    mutationFn: (body: { text: string; spoilers: boolean }) => api.postReview(slug!, body.text, body.spoilers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoilers, setSpoilers] = useState(false);

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this course</Text>
      </View>
    );
  }

  const c = data;
  const desc =
    c.description.length > 200 && !expanded
      ? `${c.description.slice(0, 200)}…`
      : c.description;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Image
        source={c.bannerUrl || c.thumbnailUrl ? { uri: (c.bannerUrl || c.thumbnailUrl)! } : undefined}
        style={styles.banner}
        resizeMode="cover"
      />
      {!c.bannerUrl && !c.thumbnailUrl && (
        <View style={[styles.banner, styles.bannerFallback]}>
          <Text style={{ color: colors.dim, fontSize: 40 }}>▶</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title}>{c.title}</Text>
        <View style={styles.metaRow}>
          <Stars value={c.ratingAvg} />
          <Text style={styles.metaText}> · {c.ratingCount} ratings</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.metaText}>{c.lessonCount} lessons</Text>
        </View>
        <Text style={styles.metaText}>
          {c.level} · {c.language} · {c.enrollmentCount.toLocaleString()} enrolled
        </Text>
        {c.isPremium && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        )}

        <View style={styles.tagRow}>
          {c.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.desc}>{desc}</Text>
        {c.description.length > 200 && (
          <Text style={styles.readMore} onPress={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Read more"}
          </Text>
        )}

        <View style={styles.actions}>
          <Text
            style={styles.enrollBtn}
            onPress={() => {
              enrollMut.mutate();
              if (c.sections[0]?.lessons[0]) {
                // navigate happens via curriculum tap; enroll silently first
              }
            }}
          >
            {enrollMut.isPending ? "…" : "Enroll & start"}
          </Text>
          <Text style={styles.iconBtn} onPress={() => saveMut.mutate()}>
            🔖
          </Text>
          <Text style={styles.iconBtn} onPress={() => likeMut.mutate()}>
            ❤️
          </Text>
        </View>

        {c.downloads && (
          <View style={styles.downloadsCard}>
            <Text style={styles.downloadsLabel}>DOWNLOADS ON SYNCOURSE</Text>
            <Text style={styles.downloadsValue}>
              {c.downloads.total.toLocaleString()} total · {c.downloads.last30.toLocaleString()} last 30
              days · {c.downloads.last7.toLocaleString()} last 7 days · {c.downloads.today} today
            </Text>
          </View>
        )}

        {c.lecturer && (
          <>
            <Text style={styles.heading}>Lecturer</Text>
            <Link href={`/lecturers/${c.lecturer.slug}`} asChild>
              <Pressable style={styles.lecturerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{c.lecturer.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lecturerName}>{c.lecturer.name}</Text>
                  {(c.lecturer.credentials || c.lecturer.bio) && (
                    <Text style={styles.muted} numberOfLines={2}>
                      {[c.lecturer.credentials, c.lecturer.bio].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Text style={{ color: colors.dim }}>›</Text>
              </Pressable>
            </Link>
          </>
        )}

        {c.organization && (
          <>
            <Text style={styles.heading}>Organization</Text>
            <Link href={`/organizations/${c.organization.slug}`} asChild>
              <Pressable style={styles.lecturerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{c.organization.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lecturerName}>{c.organization.name}</Text>
                  <Text style={styles.muted}>See all courses</Text>
                </View>
                <Text style={{ color: colors.dim }}>›</Text>
              </Pressable>
            </Link>
          </>
        )}

        <Text style={styles.heading}>Curriculum</Text>
        {c.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {section.title}{" "}
              <Text style={styles.muted}>
                · {section.lessons.length} lessons · {formatDurationSec(section.lessons.reduce((s, l) => s + l.durationSec, 0))}
              </Text>
            </Text>
            {section.lessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/courses/${c.slug}/lessons/${lesson.id}`}
                style={styles.lessonRow}
              >
                <Text style={{ color: colors.dim }}>{lesson.type === "video" ? "▶" : "📄"}</Text>
                <Text style={styles.lessonTitle} numberOfLines={1}>
                  {lesson.title}
                </Text>
                <Text style={styles.muted}>{formatDurationSec(lesson.durationSec)}</Text>
              </Link>
            ))}
          </View>
        ))}

        <Text style={styles.heading}>How it&apos;s rated</Text>
        <View style={styles.ratingCard}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewAvg}>{c.ratings.avg.toFixed(1)}</Text>
            <View style={{ flex: 1 }}>
              <StarRow value={c.ratings.avg} size={14} />
              <Text style={styles.muted}>{c.ratings.count} community ratings</Text>
            </View>
          </View>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = c.ratings.distribution[n] ?? 0;
            const max = Math.max(1, ...Object.values(c.ratings.distribution));
            return (
              <View key={n} style={styles.distRow}>
                <Text style={styles.distLabel}>{n}★</Text>
                <View style={styles.distTrack}>
                  <View style={[styles.distFill, { width: `${(count / max) * 100}%` }]} />
                </View>
              </View>
            );
          })}
          <View style={styles.rateRow}>
            <Text style={styles.muted}>Rate this course</Text>
            <StarPicker value={myRating} onChange={(s) => rateMut.mutate(s)} />
          </View>
        </View>

        <Text style={styles.heading}>Reviews · {c.reviews.length}</Text>
        <View style={styles.reviewForm}>
          <TextInput
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="Share a thought…"
            placeholderTextColor={colors.dim}
            multiline
            style={styles.reviewInput}
          />
          <View style={styles.reviewFormRow}>
            <View style={styles.spoilerRow}>
              <Text style={styles.muted}>Contains spoilers</Text>
              <Switch value={spoilers} onValueChange={setSpoilers} trackColor={{ true: colors.accent }} />
            </View>
            <Pressable
              style={[styles.postBtn, !reviewText.trim() && { opacity: 0.4 }]}
              disabled={!reviewText.trim() || reviewMut.isPending}
              onPress={() => reviewMut.mutate({ text: reviewText, spoilers })}
            >
              <Text style={styles.postLabel}>{reviewMut.isPending ? "…" : "Post review"}</Text>
            </Pressable>
          </View>
        </View>
        {c.reviews.length === 0 && (
          <Text style={styles.muted}>No reviews yet — be the first to rate this course</Text>
        )}
        {c.reviews.map((r) => (
          <View key={r.id} style={styles.review}>
            <View style={styles.reviewTop}>
              <View style={[styles.avatar, styles.smallAvatar]}>
                <Text style={styles.avatarText}>{r.userName.charAt(0)}</Text>
              </View>
              <Text style={styles.reviewer}>{r.userName}</Text>
              {r.isStaff && (
                <View style={styles.editorial}>
                  <Text style={styles.editorialText}>EDITORIAL</Text>
                </View>
              )}
            </View>
            {r.body && <Text style={styles.reviewBody}>{r.body}</Text>}
            <Text style={styles.muted}>{r.replyCount} replies</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  banner: { width: "100%", height: 210, backgroundColor: colors.surface },
  bannerFallback: { alignItems: "center", justifyContent: "center" },
  body: { padding: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  premiumBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
  },
  premiumText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: colors.muted, fontSize: 12 },
  desc: { color: "rgba(244,244,245,0.7)", fontSize: 14, lineHeight: 20, marginTop: 14 },
  readMore: { color: colors.accent, fontSize: 13, fontWeight: "600", marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  enrollBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
    borderRadius: 999,
    paddingVertical: 13,
  },
  iconBtn: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  downloadsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  downloadsLabel: { color: colors.dim, fontSize: 11, fontWeight: "700" },
  downloadsValue: { color: "rgba(244,244,245,0.7)", fontSize: 12, marginTop: 4 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  lecturerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatar: { width: 24, height: 24, borderRadius: 12 },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: "700" },
  lecturerName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  section: { marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lessonTitle: { color: colors.text, fontSize: 13, flex: 1 },
  ratingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  reviewAvg: { color: colors.text, fontSize: 32, fontWeight: "800" },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  distLabel: { color: colors.dim, fontSize: 10, width: 18 },
  distTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  distFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 6,
  },
  reviewForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  reviewInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: "top",
  },
  reviewFormRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  spoilerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  postBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  postLabel: { color: "#000", fontWeight: "800", fontSize: 12 },
  review: { marginBottom: 14 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewer: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  editorial: {
    backgroundColor: colors.accentSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editorialText: { color: colors.accent, fontSize: 9, fontWeight: "800" },
  reviewBody: { color: "rgba(244,244,245,0.7)", fontSize: 13, marginTop: 4, marginBottom: 2 },
});
