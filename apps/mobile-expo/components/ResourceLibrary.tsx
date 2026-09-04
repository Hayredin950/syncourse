import { useInfiniteQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "./Empty";
import { Press } from "./Press";
import { Sk } from "./Skeleton";
import { Text, TextInput } from "./Type";
import { ResourceCard, ResourceFeature, typeMeta } from "./ResourceCard";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { ResourceSummary } from "../lib/types";

const PER_PAGE = 12;
const TYPE_ORDER = ["cheat-sheet", "roadmap", "note"] as const;
const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "popular", label: "Popular" },
  { id: "a-z", label: "A–Z" },
] as const;

/**
 * The resource library. Cheat-sheets, roadmaps and notes are documents, not
 * courses, so this is a single column of landscape cards rather than the 3-up
 * poster grid /browse uses.
 *
 * Tab counts and category pills come from whole-library aggregates the API sends
 * with every page, so a chip never collapses to 0 the moment you filter by it.
 *
 * A component rather than a screen because it has two homes: the Resources tab
 * inside Browse, where the bottom bar stays put, and the `/resources` route a
 * deep link still lands on. `embedded` drops the page title — Browse has already
 * said where you are, and repeating it costs a phone 90px of shelf.
 */
export function ResourceLibrary({
  embedded,
  initialType,
  initialCategory,
  initialTag,
  onShowCourses,
}: {
  embedded?: boolean;
  initialType?: string;
  initialCategory?: string;
  initialTag?: string;
  /** Set by Browse: the empty state's "courses" are a tab, not a route. */
  onShowCourses?: () => void;
}) {
  const [type, setType] = useState<string>(initialType ?? "");
  const [category, setCategory] = useState<string>(initialCategory ?? "");
  const [tag, setTag] = useState<string>(initialTag ?? "");
  const [sort, setSort] = useState<string>("newest");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 900) / 2));
  /* A landscape card wants roughly 380px to hold a title, a lede and a stat row,
     so a tablet gets two of them and a phone stays single-column. */
  const cols = width >= 820 ? 2 : 1;

  // Typing shouldn't fire a request per keystroke; an empty box resets at once.
  useEffect(() => {
    if (!q) {
      setDq("");
      return;
    }
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useInfiniteQuery({
    queryKey: ["resources", type, category, tag, sort, dq],
    queryFn: ({ pageParam }) =>
      api.resources({
        type: type || undefined,
        category: category || undefined,
        tag: tag || undefined,
        sort,
        q: dq || undefined,
        limit: PER_PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    // The API answers with a whole-library `total`, so "have we got them all"
    // is a length check rather than a cursor the server has to hand back.
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.results.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  const pages = query.data?.pages ?? [];
  const items = useMemo(() => pages.flatMap((p) => p.results), [pages]);
  const first = pages[0];
  const counts = first?.counts ?? {};
  const cats = first?.categories ?? [];
  const total = first?.total ?? 0;
  const libraryTotal = useMemo(
    () => TYPE_ORDER.reduce((n, t) => n + (counts[t] ?? 0), 0),
    [counts],
  );

  const narrowed = !!(type || category || tag || dq);
  const featured = useMemo(
    () => (narrowed ? [] : items.filter((r) => r.isFeatured).slice(0, 2)),
    [items, narrowed],
  );
  const featuredIds = useMemo(() => new Set(featured.map((r) => r.id)), [featured]);
  const grid = useMemo(() => items.filter((r) => !featuredIds.has(r.id)), [items, featuredIds]);

  const reset = () => {
    setType("");
    setCategory("");
    setTag("");
    setQ("");
    setSort("newest");
  };

  const header = (
    <View style={styles.header}>
      {!embedded && (
        <>
          <Text style={styles.eyebrow}>SYNCOURSE LIBRARY</Text>
          <Text style={styles.title}>Resources</Text>
          <Text style={styles.lede}>
            Cheat-sheets, roadmaps and notes — short things you read once and keep. No bot, no
            enrolment: everything opens right here.
          </Text>
        </>
      )}
      {libraryTotal > 0 && (
        <Text style={styles.count}>
          {libraryTotal} published · {narrowed ? `${total} match this filter` : "all of it free to read"}
        </Text>
      )}

      <View style={styles.tabs}>
        <Tab label="All" count={libraryTotal} active={!type} onPress={() => setType("")} />
        {TYPE_ORDER.map((t) => (
          <Tab
            key={t}
            label={typeMeta(t).plural}
            count={counts[t] ?? 0}
            active={type === t}
            onPress={() => setType(type === t ? "" : t)}
          />
        ))}
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={15} color={colors.dim} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search resources"
          placeholderTextColor={colors.dim}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!q && (
          <Press onPress={() => setQ("")} hitSlop={12} accessibilityLabel="Clear the search box">
            <Ionicons name="close-circle" size={16} color={colors.dim} />
          </Press>
        )}
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => {
          const on = sort === s.id;
          return (
            /* Were bare Text nodes with a 6px slop: about 20px of target, and
               nothing telling a screen reader they were controls. */
            <Press
              key={s.id}
              style={[styles.sortPill, on && styles.sortPillOn]}
              onPress={() => setSort(s.id)}
              accessibilityLabel={`Sort by ${s.label}`}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.sortOption, on && styles.sortActive]}>{s.label}</Text>
            </Press>
          );
        })}
        {narrowed && (
          <Press onPress={reset} style={styles.clearAll} accessibilityLabel="Clear every filter">
            <Ionicons name="close" size={11} color={colors.muted} />
            <Text style={styles.clearAllText}>Clear</Text>
          </Press>
        )}
      </View>

      {!!tag && (
        <Press style={styles.tagChip} onPress={() => setTag("")} accessibilityLabel={`Stop filtering by ${tag}`}>
          <Text style={styles.tagChipText}>#{tag}</Text>
          <Ionicons name="close" size={11} color={colors.onAccent} />
        </Press>
      )}

      {cats.length > 0 && (
        <View style={styles.pills}>
          {cats.map((c) => {
            const on = category === c.slug;
            return (
              <Press
                key={c.slug}
                style={[styles.pill, on && styles.pillActive]}
                onPress={() => setCategory(on ? "" : c.slug)}
                accessibilityLabel={`${c.name}, ${c.count}`}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.pillLabel, on && styles.pillLabelActive]}>{c.name}</Text>
                <Text style={[styles.pillCount, on && styles.pillLabelActive]}>{c.count}</Text>
              </Press>
            );
          })}
        </View>
      )}

      {featured.length > 0 && (
        <View style={styles.featured}>
          <Text style={styles.sectionLabel}>EDITOR&apos;S PICKS</Text>
          {featured.map((r) => (
            <ResourceFeature key={r.id} resource={r} />
          ))}
        </View>
      )}
    </View>
  );

  /* Three hand-rolled states — a lone spinner, an error card with its own retry
     pill, and a bare tray icon — where the rest of the app has one of each. */
  const empty = query.isLoading ? (
    <View style={styles.skeletons}>
      {[0, 1, 2, 3].map((i) => (
        <Sk key={i} style={styles.cardSk} />
      ))}
    </View>
  ) : query.error ? (
    <Failed title="Could not load the resources" onRetry={() => query.refetch()} />
  ) : narrowed ? (
    <Empty
      icon="funnel-outline"
      title="Nothing matches that yet"
      body="No cheat-sheet, roadmap or note fits every filter you have on at once."
      action={{ label: "Clear filters", onPress: reset }}
    />
  ) : (
    <Empty
      icon="file-tray-outline"
      title="No resources published yet"
      body="Cheat-sheets, roadmaps and notes land here as they are written. The courses are ready now."
      /* Inside Browse, "the courses" are the other tab rather than another
         screen — pushing /browse on top of /browse would stack it on itself. */
      action={onShowCourses ? { label: "Browse courses", onPress: onShowCourses } : { label: "Browse courses", href: "/browse" }}
    />
  );

  return (
    <FlatList<ResourceSummary>
      style={styles.screen}
      data={grid}
      /* numColumns cannot change on a mounted list, so the count is the key. */
      key={cols}
      numColumns={cols}
      columnWrapperStyle={cols > 1 ? styles.row : undefined}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) =>
        cols > 1 ? (
          <View style={styles.cell}>
            <ResourceCard resource={item} />
          </View>
        ) : (
          <ResourceCard resource={item} />
        )
      }
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          tintColor={colors.accent}
        />
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          /* A skeleton card rather than a spinner: the next page arrives in the
             shape of the thing already on screen. */
          <Sk style={styles.cardSk} />
        ) : items.length > 0 && !query.hasNextPage ? (
          <Text style={styles.end}>That&apos;s the whole shelf — {items.length} shown.</Text>
        ) : null
      }
    />
  );
}

/** A type filter. Was a Pressable with no role and no selected state. */
function Tab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* flexGrow so the empty state centres in the screen rather than sitting
     under the filters it is telling you to clear. */
  content: { paddingVertical: 16, paddingBottom: 40, gap: 12, flexGrow: 1 },
  row: { gap: 12 },
  cell: { flex: 1 },
  header: { gap: 10, marginBottom: 2 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 27, fontWeight: "800", letterSpacing: -0.5 },
  lede: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  count: { color: colors.dim, fontSize: 11, fontVariant: ["tabular-nums"] },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
  },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  tabLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  tabLabelActive: { color: colors.text },
  tabCount: { color: colors.dim, fontSize: 10, fontVariant: ["tabular-nums"] },
  tabCountActive: { color: colors.accent, fontWeight: "800" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    height: 40,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, padding: 0 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sortPill: {
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  sortOption: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  sortActive: { color: colors.accent },
  clearAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 38,
    paddingHorizontal: 4,
    marginLeft: "auto",
  },
  clearAllText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  pillLabelActive: { color: colors.onAccent },
  pillCount: { color: colors.dim, fontSize: 10, fontVariant: ["tabular-nums"] },
  featured: { gap: 8, marginTop: 6 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    minHeight: 34,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  tagChipText: { color: colors.onAccent, fontSize: 11, fontWeight: "800" },
  sectionLabel: { color: colors.dim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  skeletons: { gap: 12, paddingTop: 4 },
  cardSk: { height: 132, borderRadius: radius.lg },
  end: { color: colors.dim, fontSize: 11, textAlign: "center", marginVertical: 18 },
});
