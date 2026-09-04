import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { FlatList, Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Sheet } from "../../components/Sheet";
import { Sk, SkGrid, SkRows } from "../../components/Skeleton";
import { ResourceLibrary } from "../../components/ResourceLibrary";
import { Text } from "../../components/Type";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import type { Category, CourseSummary } from "../../lib/types";
import { formatDuration, plural } from "../../lib/types";
import { Stars } from "../../components/StarRating";

const SORTS = [
  { id: "top-rated", label: "Top rated" },
  { id: "most-downloaded", label: "Most downloaded" },
  { id: "newest", label: "Newest" },
  { id: "a-z", label: "A–Z" },
] as const;

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];
const MIN_RATINGS = ["", "4", "4.5", "4.8"] as const;

/**
 * A page, not the whole shelf.
 *
 * This screen used to ask for `limit: 60` once and print the library's real
 * `total` above it, so a shelf of 200 courses announced 200 and then stopped
 * dead at 60 with a line of small print apologising for it. The API has taken
 * `offset` all along.
 */
const PER_PAGE = 30;

interface Filters {
  category: string;
  level: string;
  minRating: string;
}

/**
 * Browse — everything published, under one tab.
 *
 * Courses and resources were two separate destinations, which meant the shelf
 * you wanted was behind a guess about which one held it. They are both "things
 * to read or take", so they are two tabs of one screen now, and the switch sits
 * above the toolbar where it does not scroll away.
 *
 * `?tab=resources` deep-links straight to the second one.
 */
const KINDS = [
  { id: "courses", label: "Courses", icon: "school-outline" },
  { id: "resources", label: "Resources", icon: "document-text-outline" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

export default function BrowseScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [kind, setKind] = useState<Kind>(params.tab === "resources" ? "resources" : "courses");

  // A deep link that arrives while the screen is already mounted still switches.
  useEffect(() => {
    if (params.tab === "resources" || params.tab === "courses") setKind(params.tab);
  }, [params.tab]);

  return (
    <View style={styles.screen}>
      <View style={styles.kindRow}>
        {KINDS.map((k) => {
          const on = kind === k.id;
          return (
            <Press
              key={k.id}
              style={[styles.kindTab, on && styles.kindTabOn]}
              onPress={() => setKind(k.id)}
              accessibilityLabel={k.label}
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={k.icon} size={15} color={on ? colors.accent : colors.dim} />
              <Text style={[styles.kindLabel, on && styles.kindLabelOn]}>{k.label}</Text>
            </Press>
          );
        })}
      </View>
      {kind === "courses" ? (
        <CourseBrowse />
      ) : (
        <ResourceLibrary embedded onShowCourses={() => setKind("courses")} />
      )}
    </View>
  );
}

function CourseBrowse() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [sort, setSort] = useState<string>("top-rated");
  const [view, setView] = useState<"grid" | "list">("list");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ category: "", level: "", minRating: "" });
  const { width } = useWindowDimensions();
  // Three fixed columns put four-inch-wide posters on a tablet. Breakpoints
  // match SkGrid so the skeleton has the column count the results will have.
  const cols = width >= 900 ? 5 : width >= 640 ? 4 : 3;

  // deep link from a home category tile: /browse?category=<slug>
  useEffect(() => {
    if (params.category) {
      setFilters((f) => ({ ...f, category: params.category as string }));
    }
  }, [params.category]);

  const query = useInfiniteQuery({
    queryKey: ["browse", sort, filters],
    queryFn: ({ pageParam }) =>
      api.browse({
        sort,
        category: filters.category || undefined,
        level: filters.level || undefined,
        minRating: filters.minRating ? Number(filters.minRating) : undefined,
        limit: PER_PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    // The API answers with a whole-library `total`, so "have we got them all" is
    // a length check rather than a cursor the server has to hand back.
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.results.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const { isLoading, error, refetch } = query;

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const activeCount = useMemo(
    () => [filters.category, filters.level, filters.minRating].filter(Boolean).length,
    [filters],
  );

  const setParam = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? "" : value }));
  };
  const clearFilters = () => setFilters({ category: "", level: "", minRating: "" });

  const pages = query.data?.pages ?? [];
  const results = useMemo(() => pages.flatMap((p) => p.results), [pages]);
  const total = pages[0]?.total ?? 0;

  /* One control for both lists: switching grid/list swaps which FlatList is
     mounted, and a pull has to mean the same thing either way. A pull that also
     read `isFetchingNextPage` would spin the top of the list while the *bottom*
     loaded. */
  const refresh = (
    <RefreshControl
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => refetch()}
      tintColor={colors.accent}
    />
  );
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };
  const footer = query.isFetchingNextPage ? (
    /* Skeletons in the shape of the rows already on screen, rather than a
       spinner: the page that is arriving looks like the page that is here. */
    view === "grid" ? (
      <View style={styles.tailGrid}>
        {Array.from({ length: cols }).map((_, i) => (
          <Sk key={i} style={styles.tailPoster} />
        ))}
      </View>
    ) : (
      <View style={styles.tailList}>
        <Sk style={styles.tailRow} />
        <Sk style={styles.tailRow} />
      </View>
    )
  ) : results.length > 0 && !query.hasNextPage ? (
    <Text style={styles.more}>
      That&apos;s the whole shelf — {plural(results.length, "course")} shown.
    </Text>
  ) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Press
          style={[styles.filterBtn, activeCount > 0 && styles.filterBtnOn]}
          onPress={() => setShowFilters(true)}
          accessibilityLabel={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
        >
          <Ionicons name="options-outline" size={15} color={activeCount > 0 ? colors.accent : colors.text} />
          <Text style={[styles.filterLabel, activeCount > 0 && styles.filterLabelOn]}>Filters</Text>
          {activeCount > 0 && (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeCount}</Text>
            </View>
          )}
        </Press>
        <View style={styles.spacer} />
        <View style={styles.viewToggle}>
          {(["grid", "list"] as const).map((v) => (
            <Press
              key={v}
              style={[styles.viewBtn, view === v && styles.viewBtnActive]}
              onPress={() => setView(v)}
              accessibilityLabel={v === "grid" ? "Grid view" : "List view"}
              accessibilityState={{ selected: view === v }}
            >
              <Ionicons
                name={v === "grid" ? "grid-outline" : "list-outline"}
                size={16}
                color={view === v ? colors.text : colors.dim}
              />
            </Press>
          ))}
        </View>
      </View>

      {/* Four sort options plus "Most downloaded" ran off the edge of a small
          phone with no way to reach the last one. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
      >
        {SORTS.map((s) => (
          <Press
            key={s.id}
            style={[styles.sortChip, sort === s.id && styles.sortChipOn]}
            onPress={() => setSort(s.id)}
            accessibilityLabel={`Sort by ${s.label}`}
            accessibilityState={{ selected: sort === s.id }}
          >
            <Text style={[styles.sortOption, sort === s.id && styles.sortActive]}>{s.label}</Text>
          </Press>
        ))}
      </ScrollView>

      {!isLoading && !error && (
        <Text style={styles.count}>
          {plural(total, "course")}
          {activeCount > 0 ? " · filtered" : ""}
        </Text>
      )}

      {isLoading ? (
        view === "grid" ? <SkGrid n={9} /> : <SkRows n={7} />
      ) : error ? (
        <Failed title="Could not load courses" onRetry={() => refetch()} />
      ) : results.length === 0 ? (
        <Empty
          icon="funnel-outline"
          title="Nothing matches those filters"
          body="Loosen one of them and the shelf fills back up."
          action={activeCount > 0 ? { label: "Clear filters", onPress: clearFilters } : undefined}
        />
      ) : view === "grid" ? (
        <FlatList
          key={`browse-grid-${cols}`}
          data={results}
          keyExtractor={(c) => c.id}
          numColumns={cols}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <GridCard course={item} />}
          refreshControl={refresh}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListFooterComponent={footer}
        />
      ) : (
        <FlatList
          key="browse-list"
          data={results}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <BrowseRow course={item} />}
          refreshControl={refresh}
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListFooterComponent={footer}
        />
      )}

      <Sheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
        subtitle={activeCount > 0 ? `${activeCount} active` : "Narrow the library down"}
        footer={
          <View style={styles.sheetActions}>
            <Press
              style={styles.clearBtn}
              onPress={clearFilters}
              disabled={activeCount === 0}
              accessibilityLabel="Clear all filters"
            >
              <Text style={styles.clearLabel}>Clear all</Text>
            </Press>
            <Press
              style={styles.doneBtn}
              onPress={() => setShowFilters(false)}
              haptic
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.doneLabel}>
                Show {plural(total, "course")}
              </Text>
            </Press>
          </View>
        }
      >
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
            {MIN_RATINGS.map((r) => {
              const on = filters.minRating === r;
              return (
                <Chip
                  key={r || "any"}
                  label={r ? `${r} and up` : "Any"}
                  accessibilityLabel={r ? `${r} stars and up` : "Any rating"}
                  active={on}
                  onPress={() => setParam("minRating", r)}
                >
                  {r ? (
                    /* Was "4 ★ and up" — Manrope has no star, so that one glyph
                       fell through to a system font in the middle of the label. */
                    <>
                      <Text style={[styles.chipLabel, on && styles.chipLabelActive]}>{r}</Text>
                      <Ionicons name="star" size={10} color={on ? colors.onAccent : colors.star} />
                      <Text style={[styles.chipLabel, on && styles.chipLabelActive]}>and up</Text>
                    </>
                  ) : undefined}
                </Chip>
              );
            })}
          </View>
        </Group>
      </Sheet>
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

function Chip({
  label,
  active,
  onPress,
  children,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Replaces the plain label — the min-rating chips need a real star glyph. */
  children?: React.ReactNode;
  /** What a screen reader says, when the visible label is not a sentence. */
  accessibilityLabel?: string;
}) {
  return (
    <Press
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
    >
      {children ?? <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>}
    </Press>
  );
}

function BrowseRow({ course }: { course: CourseSummary }) {
  const router = useRouter();
  const meta = [course.level, course.durationMin ? formatDuration(course.durationMin) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <Press
      style={styles.row}
      onPress={() => router.push(`/courses/${course.slug}`)}
      accessibilityLabel={course.title}
    >
      {/* Every row drew a "▶" in a grey box while the cover URL sat unused in
          the same object. */}
      {course.thumbnailUrl ? (
        <Image
          source={{ uri: cloudinaryUrl(course.thumbnailUrl, { width: 192, height: 144 }) ?? undefined }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="school-outline" size={18} color={colors.dim} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {course.title}
        </Text>
        {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
        {course.ratingCount > 0 ? (
          <View style={styles.starsRow}>
            <Stars value={course.ratingAvg} />
            <Text style={styles.rowMeta}> {plural(course.ratingCount, "rating")}</Text>
          </View>
        ) : (
          <Text style={styles.rowMeta}>Not yet rated</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.dim} />
    </Press>
  );
}

function GridCard({ course }: { course: CourseSummary }) {
  const router = useRouter();
  return (
    <Press
      style={styles.gridCard}
      onPress={() => router.push(`/courses/${course.slug}`)}
      accessibilityLabel={course.title}
    >
      {course.thumbnailUrl ? (
        <Image source={{ uri: cloudinaryUrl(course.thumbnailUrl, { width: 300, height: 450 }) ?? undefined }} style={styles.gridThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.gridThumb, styles.gridThumbFallback]}>
          <Ionicons name="school-outline" size={20} color={colors.dim} />
        </View>
      )}
      <Text numberOfLines={2} style={styles.gridTitle}>
        {course.title}
      </Text>
      <Text style={styles.rowMeta}>{course.level}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* Courses | Resources. Outside both lists so it cannot scroll away, and a
     bottom rule under the whole row so the two tabs read as one control. */
  kindRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  kindTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flex: 1,
    minHeight: 46,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  kindTabOn: { borderBottomColor: colors.accent },
  kindLabel: { color: colors.dim, fontSize: 13, fontWeight: "700" },
  kindLabelOn: { color: colors.text },
  toolbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  // 7px of padding on 13px type is a 27px-tall target. These two controls are
  // the whole toolbar and both sat well under the 44pt minimum.
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  // "Filters 2" said how many were on but not *that* any were on.
  filterBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  filterLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  filterLabelOn: { color: colors.accent },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  filterCountText: { color: colors.onAccent, fontSize: 10, fontWeight: "800" },
  spacer: { flex: 1 },
  viewToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  viewBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  viewBtnActive: { backgroundColor: colors.surfaceRaised },
  sortRow: { flexDirection: "row", gap: 8, paddingLeft: 16, paddingRight: 24, paddingTop: 12 },
  sortChip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  sortOption: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  sortActive: { color: colors.accent },
  count: { color: colors.muted, fontSize: 12, paddingHorizontal: 16, paddingTop: 10 },
  more: { color: colors.dim, fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 18 },
  tailList: { gap: 10, marginTop: 10 },
  tailRow: { height: 68, borderRadius: radius.md },
  tailGrid: { flexDirection: "row", gap: 12, marginTop: 2 },
  tailPoster: { flex: 1, aspectRatio: 2 / 3, borderRadius: radius.md },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 32, paddingTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 64, height: 48, borderRadius: radius.sm, backgroundColor: colors.bg },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  rowMeta: { color: colors.muted, fontSize: 12 },
  starsRow: { flexDirection: "row", alignItems: "center" },
  // Matches SkGrid's gutter and gap exactly, so the skeleton doesn't jump a
  // column's worth of space sideways when the real posters arrive.
  grid: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  gridRow: { gap: 12, marginBottom: 14 },
  gridCard: { flex: 1 },
  gridThumb: { width: "100%", aspectRatio: 2 / 3, borderRadius: radius.md, backgroundColor: colors.surface },
  gridThumbFallback: { alignItems: "center", justifyContent: "center" },
  gridTitle: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6, lineHeight: 16 },
  sheetActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  clearBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  doneBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  doneLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  group: { marginBottom: 18 },
  groupTitle: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 9,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 12.5, fontWeight: "600" },
  chipLabelActive: { color: colors.onAccent, fontWeight: "800" },
});
