import { useInfiniteQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ResourceCard, ResourceFeature, typeMeta } from "../../components/ResourceCard";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import type { ResourceSummary } from "../../lib/types";

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
 */
export default function ResourcesScreen() {
  const params = useLocalSearchParams<{ type?: string; category?: string; tag?: string }>();
  const router = useRouter();
  const [type, setType] = useState<string>(params.type ?? "");
  const [category, setCategory] = useState<string>(params.category ?? "");
  const [tag, setTag] = useState<string>(params.tag ?? "");
  const [sort, setSort] = useState<string>("newest");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");

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
      <Text style={styles.eyebrow}>SYNCOURSE LIBRARY</Text>
      <Text style={styles.title}>Resources</Text>
      <Text style={styles.lede}>
        Cheat-sheets, roadmaps and notes — short things you read once and keep. No bot, no
        enrolment: everything opens right here.
      </Text>
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
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.dim} />
          </Pressable>
        )}
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable key={s.id} onPress={() => setSort(s.id)} hitSlop={6}>
            <Text style={[styles.sortOption, sort === s.id && styles.sortActive]}>{s.label}</Text>
          </Pressable>
        ))}
        {narrowed && (
          <Pressable onPress={reset} hitSlop={6} style={styles.clearAll}>
            <Ionicons name="close" size={11} color={colors.muted} />
            <Text style={styles.clearAllText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {!!tag && (
        <Pressable style={styles.tagChip} onPress={() => setTag("")}>
          <Text style={styles.tagChipText}>#{tag}</Text>
          <Ionicons name="close" size={11} color="#211308" />
        </Pressable>
      )}

      {cats.length > 0 && (
        <View style={styles.pills}>
          {cats.map((c) => (
            <Pressable
              key={c.slug}
              style={[styles.pill, category === c.slug && styles.pillActive]}
              onPress={() => setCategory(category === c.slug ? "" : c.slug)}
            >
              <Text style={[styles.pillLabel, category === c.slug && styles.pillLabelActive]}>
                {c.name}
              </Text>
              <Text style={[styles.pillCount, category === c.slug && styles.pillLabelActive]}>
                {c.count}
              </Text>
            </Pressable>
          ))}
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

  const empty = query.isLoading ? (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  ) : query.error ? (
    <View style={styles.center}>
      <Text style={styles.muted}>Could not load resources.</Text>
      <Text style={styles.mutedSmall}>
        {query.error instanceof Error ? query.error.message : "Try again in a moment."}
      </Text>
      <Pressable style={styles.retry} onPress={() => query.refetch()}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.center}>
      <Ionicons name="file-tray-outline" size={26} color={colors.dim} />
      <Text style={styles.muted}>
        {narrowed ? "Nothing matches that yet." : "No resources published yet."}
      </Text>
      {narrowed ? (
        <Pressable style={styles.retry} onPress={reset}>
          <Text style={styles.retryText}>Clear filters</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.retry} onPress={() => router.push("/browse" as never)}>
          <Text style={styles.retryText}>Browse courses</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <FlatList<ResourceSummary>
      style={styles.screen}
      data={grid}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ResourceCard resource={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={styles.content}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 18 }} />
        ) : items.length > 0 && !query.hasNextPage ? (
          <Text style={styles.end}>That&apos;s the whole shelf — {items.length} shown.</Text>
        ) : null
      }
    />
  );
}

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
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  sortRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  sortOption: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  sortActive: { color: colors.accent },
  clearAll: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  clearAllText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  pillLabelActive: { color: "#211308" },
  pillCount: { color: colors.dim, fontSize: 10, fontVariant: ["tabular-nums"] },
  featured: { gap: 8, marginTop: 6 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tagChipText: { color: "#211308", fontSize: 11, fontWeight: "800" },
  sectionLabel: { color: colors.dim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 },
  muted: { color: colors.muted, fontSize: 13 },
  mutedSmall: { color: colors.dim, fontSize: 11, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 4,
  },
  retryText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  end: { color: colors.dim, fontSize: 11, textAlign: "center", marginVertical: 18 },
});
