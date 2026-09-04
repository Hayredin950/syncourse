import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { Text } from "./Type";
import { colors, radius } from "../lib/tokens";
import { formatDuration, plural, type CourseSummary } from "../lib/types";
import { cloudinaryUrl } from "../lib/cloudinary";
import { Stars } from "./StarRating";

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function CourseCard({ course, width = 132 }: { course: CourseSummary; width?: number }) {
  const meta = [course.level, formatDuration(course.durationMin)].filter(Boolean).join(" · ");
  const coverH = Math.round(width * 1.14);
  const hue = hueFromString(course.slug || course.id);
  const words = (course.title || "Course")
    .replace(/[—–\-:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.toUpperCase());

  const router = useRouter();
  const go = useCallback(() => router.push(`/courses/${course.slug}`), [router, course.slug]);
  const rated = course.ratingCount > 0;

  return (
    <Press style={{ width }} onPress={go} accessibilityLabel={course.title}>
      {course.thumbnailUrl ? (
        <Image
          source={{
            uri: cloudinaryUrl(course.thumbnailUrl, { width: width * 2, height: Math.round(width * 2 * 1.14) }) ?? undefined,
          }}
          style={[styles.cover, { width, height: coverH }]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.coverFallback,
            { width, height: coverH, backgroundColor: `hsl(${hue} 42% 18%)` },
          ]}
        >
          <View style={styles.coverMark}>
            {words.map((w, i) => (
              <Text key={i} style={styles.coverMarkLine}>
                {w}
              </Text>
            ))}
          </View>
        </View>
      )}
      {/* Both badges used to live inside the fallback branch, so a premium course
          with a real cover advertised nothing. */}
      {course.isPremium && (
        <View style={styles.premium}>
          <Text style={styles.premiumText}>Premium</Text>
        </View>
      )}
      {course.isNew && (
        <View style={styles.added}>
          <Text style={styles.addedText}>Added</Text>
        </View>
      )}
      <Text numberOfLines={2} style={styles.title}>
        {course.title}
      </Text>
      {!!meta && (
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
      )}
      {/* Unrated courses drew five empty stars over "0 votes", which reads as a
          course everybody hated rather than one nobody has rated. */}
      {rated ? (
        <>
          <Stars value={course.ratingAvg} />
          <Text style={styles.votes} numberOfLines={1}>
            {plural(course.ratingCount, "vote")}
          </Text>
        </>
      ) : (
        <Text style={styles.votes} numberOfLines={1}>
          Not yet rated
        </Text>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.md, backgroundColor: colors.surface },
  coverFallback: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverMark: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 12,
  },
  coverMarkLine: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 16,
  },
  premium: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  premiumText: { color: colors.onAccent, fontSize: 9, fontWeight: "800" },
  added: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  addedText: { color: colors.onSuccess, fontSize: 9, fontWeight: "800" },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  meta: { color: colors.muted, fontSize: 11, marginTop: 1 },
  votes: { color: colors.dim, fontSize: 11, marginTop: 1 },
});
