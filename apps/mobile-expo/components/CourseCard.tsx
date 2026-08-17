import { Link } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/tokens";
import { formatDuration, type CourseSummary } from "../lib/types";
import { cloudinaryUrl } from "../lib/cloudinary";
import { Stars } from "./StarRating";

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const TYPE_ICONS: Record<string, string> = {
  course: "🎓",
  "mini-course": "⚡",
  "cheat-sheet": "📄",
  roadmap: "🗺️",
};

export function CourseCard({ course, width = 132 }: { course: CourseSummary; width?: number }) {
  const meta = [course.level, formatDuration(course.durationMin)].filter(Boolean).join(" · ");
  const coverH = Math.round(width * 1.14);
  const hue = hueFromString(course.slug || course.id);
  const icon = TYPE_ICONS[course.contentType ?? "course"] ?? "🎓";

  return (
    <Link href={`/courses/${course.slug}`} asChild>
      <View style={{ width }}>
        {course.thumbnailUrl ? (
          <Image
            source={
              course.thumbnailUrl
                ? { uri: cloudinaryUrl(course.thumbnailUrl, { width: width * 2, height: Math.round(width * 2 * 1.14) }) ?? undefined }
                : undefined
            }
            style={[styles.cover, { width, height: coverH }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.coverFallback, { width, height: coverH, backgroundColor: `hsl(${hue} 42% 18%)` }]}>
            <Text style={styles.fallbackIcon}>{icon}</Text>
            <View style={styles.accentBar} />
          </View>
        )}
        {course.isNew && (
          <View style={styles.added}>
            <Text style={styles.addedText}>ADDED</Text>
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
        <Stars value={course.ratingAvg} />
        <Text style={styles.votes} numberOfLines={1}>
          {course.ratingCount.toLocaleString()} votes
        </Text>
      </View>
    </Link>
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
  fallbackIcon: { fontSize: 26, opacity: 0.9 },
  accentBar: {
    position: "absolute",
    top: 10,
    left: 10,
    height: 3,
    width: 32,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  added: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.success,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addedText: { color: "#000", fontSize: 9, fontWeight: "800" },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  meta: { color: colors.muted, fontSize: 11, marginTop: 1 },
  votes: { color: colors.dim, fontSize: 11, marginTop: 1 },
});
