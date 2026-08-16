import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";
import type { CourseSummary } from "../../lib/types";
import { Stars } from "../../components/StarRating";

const SORTS = [
  { id: "top-rated", label: "Top rated" },
  { id: "most-enrolled", label: "Most enrolled" },
  { id: "a-z", label: "A–Z" },
] as const;

export default function BrowseScreen() {
  const [sort, setSort] = useState<string>("top-rated");
  const { data, isLoading, error } = useQuery({
    queryKey: ["browse", sort],
    queryFn: () => api.browse({ sort }),
  });

  return (
    <View style={styles.screen}>
      <View style={styles.sortBar}>
        {SORTS.map((s) => (
          <Text
            key={s.id}
            style={[styles.sortOption, sort === s.id && styles.sortActive]}
            onPress={() => setSort(s.id)}
          >
            {s.label}
          </Text>
        ))}
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load courses</Text>
        </View>
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No courses match</Text>}
          renderItem={({ item }) => <BrowseRow course={item} />}
        />
      )}
    </View>
  );
}

function BrowseRow({ course }: { course: CourseSummary }) {
  const meta = [course.level, course.durationMin ? `${Math.round(course.durationMin)}m` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/courses/${course.slug}`} asChild>
      <View style={styles.row}>
        <View style={styles.thumb}>
          <Text style={{ color: colors.dim, fontSize: 18 }}>▶</Text>
        </View>
        <View style={styles.rowBody}>
          <Text numberOfLines={2} style={styles.rowTitle}>
            {course.title}
          </Text>
          {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
          <Stars value={course.ratingAvg} />
        </View>
        <Text style={{ color: colors.dim }}>›</Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sortBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortOption: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  sortActive: { color: colors.accent },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 13 },
  list: { paddingHorizontal: 16, gap: 14, paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 10,
  },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 12 },
});
