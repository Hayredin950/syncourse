import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { cloudinaryUrl } from "../../lib/cloudinary";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import type { Category, CourseSummary } from "../../lib/types";
import { formatDuration } from "../../lib/types";
import { Stars } from "../../components/StarRating";

const SORTS = [
  { id: "top-rated", label: "Top rated" },
  { id: "most-enrolled", label: "Most enrolled" },
  { id: "newest", label: "Newest" },
  { id: "a-z", label: "A–Z" },
] as const;

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];
const MIN_RATINGS = ["", "4", "4.5", "4.8"] as const;

interface Filters {
  category: string;
  level: string;
  minRating: string;
}

export default function BrowseScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [sort, setSort] = useState<string>("top-rated");
  const [view, setView] = useState<"grid" | "list">("list");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ category: "", level: "", minRating: "" });

  // deep link from a home category tile: /browse?category=<slug>
  useEffect(() => {
    if (params.category) {
      setFilters((f) => ({ ...f, category: params.category as string }));
    }
  }, [params.category]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["browse", sort, filters],
    queryFn: () =>
      api.browse({
        sort,
        category: filters.category || undefined,
        level: filters.level || undefined,
        minRating: filters.minRating ? Number(filters.minRating) : undefined,
        limit: 60,
      }),
  });

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const activeCount = useMemo(
    () => [filters.category, filters.level, filters.minRating].filter(Boolean).length,
    [filters],
  );

  const setParam = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? "" : value }));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <Text style={styles.filterLabel}>Filters{activeCount > 0 ? ` ${activeCount}` : ""}</Text>
        </Pressable>
        <View style={styles.spacer} />
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.viewBtn, view === "grid" && styles.viewBtnActive]}
            onPress={() => setView("grid")}
          >
            <Text style={[styles.viewIcon, view === "grid" && styles.viewIconActive]}>▦</Text>
          </Pressable>
          <Pressable
            style={[styles.viewBtn, view === "list" && styles.viewBtnActive]}
            onPress={() => setView("list")}
          >
            <Text style={[styles.viewIcon, view === "list" && styles.viewIconActive]}>☰</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable key={s.id} onPress={() => setSort(s.id)}>
            <Text style={[styles.sortOption, sort === s.id && styles.sortActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.count}>{data?.total ?? 0}+ results</Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load courses</Text>
        </View>
      ) : (data?.results ?? []).length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No courses match those filters</Text>
        </View>
      ) : view === "grid" ? (
        <FlatList
          key="browse-grid"
          data={data!.results}
          keyExtractor={(c) => c.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <GridCard course={item} />}
        />
      ) : (
        <FlatList
          key="browse-list"
          data={data!.results}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <BrowseRow course={item} />}
        />
      )}

      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowFilters(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <Pressable onPress={() => setShowFilters(false)}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>

            <Group title="Category">
              <View style={styles.chips}>
                {categoriesQuery.data?.map((c: Category) => (
                  <Chip key={c.slug} label={c.name} active={filters.category === c.slug} onPress={() => setParam("category", c.slug)} />
                ))}
              </View>
            </Group>

            <Group title="Level">
              <View style={styles.chips}>
                {LEVELS.map((l) => (
                  <Chip key={l} label={l} active={filters.level === l} onPress={() => setParam("level", l)} />
                ))}
              </View>
            </Group>

            <Group title="Min rating">
              <View style={styles.chips}>
                {MIN_RATINGS.map((r) => (
                  <Chip
                    key={r || "any"}
                    label={r ? `${r}★+` : "Any"}
                    active={filters.minRating === r}
                    onPress={() => setParam("minRating", r)}
                  />
                ))}
              </View>
            </Group>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function BrowseRow({ course }: { course: CourseSummary }) {
  const meta = [course.level, course.durationMin ? formatDuration(course.durationMin) : ""]
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
          <View style={styles.starsRow}>
            <Stars value={course.ratingAvg} />
            <Text style={styles.rowMeta}> ({course.ratingCount})</Text>
          </View>
        </View>
        <Text style={{ color: colors.dim }}>›</Text>
      </View>
    </Link>
  );
}

function GridCard({ course }: { course: CourseSummary }) {
  return (
    <Link href={`/courses/${course.slug}`} asChild>
      <View style={styles.gridCard}>
        {course.thumbnailUrl ? (
          <Image source={{ uri: cloudinaryUrl(course.thumbnailUrl, { width: 300, height: 450 }) ?? undefined }} style={styles.gridThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.gridThumb, styles.gridThumbFallback]}>
            <Text style={{ color: colors.dim }}>▶</Text>
          </View>
        )}
        <Text numberOfLines={2} style={styles.gridTitle}>
          {course.title}
        </Text>
        <Text style={styles.rowMeta}>{course.level}</Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toolbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  filterBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  spacer: { flex: 1 },
  viewToggle: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  viewBtnActive: { backgroundColor: colors.surfaceRaised },
  viewIcon: { color: colors.dim, fontSize: 14 },
  viewIconActive: { color: colors.text },
  sortRow: { flexDirection: "row", gap: 14, paddingHorizontal: 16, paddingTop: 12 },
  sortOption: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  sortActive: { color: colors.accent },
  count: { color: colors.muted, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 13 },
  list: { paddingHorizontal: 16, gap: 14, paddingBottom: 32, paddingTop: 12 },
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
  starsRow: { flexDirection: "row", alignItems: "center" },
  grid: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 32 },
  gridRow: { gap: 10, marginBottom: 14 },
  gridCard: { flex: 1 },
  gridThumb: { width: "100%", aspectRatio: 2 / 3, borderRadius: 10, backgroundColor: colors.surface },
  gridThumbFallback: { alignItems: "center", justifyContent: "center" },
  gridTitle: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  done: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  group: { marginBottom: 18 },
  groupTitle: { color: colors.dim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  chipLabelActive: { color: "#000", fontWeight: "700" },
});
