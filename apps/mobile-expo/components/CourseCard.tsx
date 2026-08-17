import { Link } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/tokens";
import { formatDuration, type CourseSummary } from "../lib/types";
import { cloudinaryUrl } from "../lib/cloudinary";
import { Stars } from "./StarRating";

export function CourseCard({ course, width = 132 }: { course: CourseSummary; width?: number }) {
  const meta = [
    course.level,
    formatDuration(course.durationMin),
  ].filter(Boolean).join(" · ");

  return (
    <Link href={`/courses/${course.slug}`} asChild>
      <View style={{ width }}>
        <Image
          source={
            course.thumbnailUrl
              ? { uri: cloudinaryUrl(course.thumbnailUrl, { width: width * 2, height: Math.round(width * 2 * 1.14) }) ?? undefined }
              : undefined
          }
          style={[styles.cover, { width, height: width * 1.14 }]}
          resizeMode="cover"
        />
        {!course.thumbnailUrl && (
          <View style={[styles.coverFallback, { width, height: width * 1.14 }]}>
            <Text style={{ color: colors.dim, fontSize: 26 }}>▶</Text>
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
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 0,
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
