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
  const hueB = (hue + 55) % 360;
  const words = (course.title || "Course")
    .replace(/[—–\-:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.toUpperCase());
  const code =
    course.contentType === "mini-course"
      ? "MINI"
      : course.contentType === "cheat-sheet"
        ? "SHEET"
        : course.contentType === "roadmap"
          ? "MAP"
          : "CRS";

  return (
    <Link href={`/courses/${course.slug}`} asChild>
      <View style={{ width }}>
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
            <Text style={styles.coverCode}>SC / {code} · {course.level.slice(0, 3).toUpperCase()}</Text>
            <View style={styles.coverMark}>
              {words.map((w, i) => (
                <Text key={i} style={styles.coverMarkLine}>
                  {w}
                </Text>
              ))}
            </View>
            {course.isPremium && (
              <View style={styles.premium}>
                <Text style={styles.premiumText}>Premium</Text>
              </View>
            )}
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
  coverCode: {
    position: "absolute",
    top: 10,
    left: 10,
    color: colors.text,
    opacity: 0.8,
    fontFamily: "monospace",
    fontSize: 8,
    letterSpacing: 0.5,
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
    bottom: 10,
    left: 10,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  premiumText: { color: "#211308", fontSize: 9, fontWeight: "800" },
  added: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  addedText: { color: "#10231a", fontSize: 9, fontWeight: "800" },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  meta: { color: colors.muted, fontSize: 11, marginTop: 1 },
  votes: { color: colors.dim, fontSize: 11, marginTop: 1 },
});
