import { Link } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/tokens";
import type { CourseSummary, ResourceSummary } from "../lib/types";
import { CourseCard } from "./CourseCard";
import { ResourceCard } from "./ResourceCard";

export function Rail({
  title,
  courses,
  href,
}: {
  title: string;
  courses: CourseSummary[];
  href?: string;
}) {
  if (courses.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {href && (
          <Link href={href} style={styles.seeAll}>
            See all
          </Link>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The same rail for documents. Resources use a landscape card, so they get a
 * wider slot than the 2:3 posters above — the shape is how you tell a
 * cheat-sheet from a course before reading a word of it.
 */
export function ResourceRail({
  title,
  resources,
  href,
}: {
  title: string;
  resources: ResourceSummary[];
  href?: string;
}) {
  if (resources.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {href && (
          <Link href={href} style={styles.seeAll}>
            See all
          </Link>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {resources.map((r) => (
          <ResourceCard key={r.id} resource={r} width={248} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  row: { paddingHorizontal: 16, gap: 12 },
});
