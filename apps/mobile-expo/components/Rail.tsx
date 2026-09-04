import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { Text } from "./Type";
import { colors, radius } from "../lib/tokens";
import type { CourseSummary, ResourceSummary } from "../lib/types";
import { CourseCard } from "./CourseCard";
import { ResourceCard } from "./ResourceCard";

/**
 * One section heading, used by every rail and grid on the app.
 *
 * Titles used to carry their own emoji ("🔥 Trending"), which renders at a
 * different size and baseline on every OS and cannot take the accent colour;
 * `icon` draws the same glyph from the icon font instead. "See all" was a bare
 * `<Link>`, so it had no press state and a target the height of one line of 13px
 * type — it is a button now.
 */
export function SectionHeader({
  title,
  icon,
  href,
  seeAllLabel = "See all",
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  href?: string;
  seeAllLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleWrap}>
        {!!icon && <Ionicons name={icon} size={16} color={colors.accent} />}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {!!href && (
        // A single registered style, never an array: expo-router's <Slot> throws
        // on an array style in development.
        <Link href={href as never} asChild>
          <Press style={styles.seeAll} accessibilityLabel={`${seeAllLabel}: ${title}`}>
            <Text style={styles.seeAllText}>{seeAllLabel}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.accent} />
          </Press>
        </Link>
      )}
    </View>
  );
}

export function Rail({
  title,
  icon,
  courses,
  href,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  courses: CourseSummary[];
  href?: string;
}) {
  if (courses.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} icon={icon} href={href} />
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
  icon,
  resources,
  href,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  resources: ResourceSummary[];
  href?: string;
}) {
  if (resources.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} icon={icon} href={href} />
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
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 34,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: radius.pill,
  },
  seeAllText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  row: { paddingHorizontal: 16, gap: 12 },
});
