import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Image, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "../../components/Type";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Rail, ResourceRail, SectionHeader } from "../../components/Rail";
import { SkHome } from "../../components/Skeleton";
import { CourseCard } from "../../components/CourseCard";
import { Stars } from "../../components/StarRating";
import { cloudinaryUrl } from "../../lib/cloudinary";
import * as api from "../../lib/api";
import { colors, elevation, radius } from "../../lib/tokens";
import { formatDuration, plural, type CourseSummary, type HomeFeed } from "../../lib/types";

export default function HomeScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["home"],
    queryFn: api.home,
  });
  const [catSlug, setCatSlug] = useState<string>("");
  const [lecturerSlug, setLecturerSlug] = useState<string>("");
  const [orgSlug, setOrgSlug] = useState<string>("");
  const { width } = useWindowDimensions();

  // ALL hooks first, unconditionally — React requires the same hooks on every
  // render, so nothing may be called after the early returns below.
  const catCoursesQ = useQuery({
    queryKey: ["category-courses", catSlug],
    queryFn: () => api.browse({ category: catSlug, limit: 8 }).then((r) => r.results),
    enabled: !!catSlug,
  });
  const activeLecturer =
    (data?.lecturers ?? []).find((l) => l.slug === lecturerSlug) ?? data?.lecturers?.[0];
  const lecturerCoursesQ = useQuery({
    queryKey: ["lecturer-courses", activeLecturer?.slug],
    queryFn: () => api.browse({ lecturer: activeLecturer?.slug, limit: 8 }).then((r) => r.results),
    enabled: !!activeLecturer?.slug,
  });
  const router = useRouter();
  const goTo = useCallback((href: string) => () => router.push(href as never), [router]);

  // Resources aren't part of /home, which is a course feed. The rail simply
  // doesn't render if this fails or comes back empty, so a library with no
  // cheat-sheets yet costs the home screen nothing.
  const resourcesQ = useQuery({
    queryKey: ["home-resources"],
    queryFn: () => api.resources({ limit: 8 }),
  });

  if (isLoading) return <SkHome />;

  if (error || !data) {
    // This used to print `error.message` *and* `error.cause` at 11px and 10px —
    // a reader got "TypeError: Network request failed" and a truncated Java
    // exception. The transport detail now stays in the log where it belongs.
    return (
      <Failed
        title="Could not reach the server"
        body={error instanceof api.ApiError ? error.message : "Check your connection and try again."}
        onRetry={() => refetch()}
      />
    );
  }

  const feed: HomeFeed = data;

  // dropdown rows — same data the web uses, swapped client-side per selection
  const catCourses = catSlug ? (catCoursesQ.data ?? []) : feed.trending.slice(0, 8);
  const activeOrg = (feed.bestOf ?? []).find((o) => o.slug === orgSlug) ?? feed.bestOf?.[0];
  const hero = feed.trending[0];
  // A fixed 240px hero is a third of a small phone and a letterbox strip on a
  // tablet; the category grid was three fixed 31% tiles at any width, so on a
  // tablet three tiles ran the width of the screen.
  const heroH = Math.min(300, Math.round(width * 0.62));
  const catCols = width >= 900 ? 6 : width >= 620 ? 4 : 3;
  const catW = Math.floor((width - 32 - (catCols - 1) * 10) / catCols);
  /* The rating used to be `${avg} ★` folded into this joined string — Manrope has
     no star, so the one glyph came from a fallback font at its own baseline. It
     is drawn beside the line now instead. */
  const heroMeta = [hero?.level, formatDuration(hero?.durationMin ?? 0)].filter(Boolean).join(" · ");

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
      }
      contentContainerStyle={styles.content}
    >
      {/* hero — featured course banner */}
      {hero && (
        <Press style={[styles.hero, { height: heroH }]} onPress={goTo(`/courses/${hero.slug}`)} accessibilityLabel={`Featured course: ${hero.title}`}>
          {hero.thumbnailUrl ? (
            <Image
              source={{ uri: cloudinaryUrl(hero.thumbnailUrl, { width: 720, height: 500 }) ?? undefined }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroFallback]} />
          )}
          <View style={styles.heroShade} />
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>FEATURED COURSE</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
            <View style={styles.heroMetaRow}>
              {!!hero.ratingCount && <Stars value={hero.ratingAvg} size={11} />}
              {!!heroMeta && (
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  {hero.ratingCount ? `· ${heroMeta}` : heroMeta}
                </Text>
              )}
            </View>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Start learning free</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.onAccent} />
            </View>
          </View>
        </Press>
      )}

      <Rail title="Trending" icon="flame" courses={feed.trending} href="/browse" />
      <Rail title="Latest added" icon="sparkles" courses={feed.latest} href="/browse" />
      <Rail title="Top rated" icon="star" courses={feed.topRated} href="/browse" />

      <ResourceRail
        title="Cheat-sheets & roadmaps"
        icon="document-text"
        resources={resourcesQ.data?.results ?? []}
        href="/resources"
      />

      {/* Explore by Category — dropdown row (phonofilm: Movie Genre →) */}
      <DropdownRow
        title="Explore by Category"
        icon="pricetags"
        options={feed.categories.map((c) => ({ value: c.slug, label: c.name }))}
        value={catSlug}
        onChange={setCatSlug}
        courses={catCourses}
      />

      {/* By Instructor — dropdown row */}
      <DropdownRow
        title="By Instructor"
        icon="person-circle"
        options={feed.lecturers.map((l) => ({ value: l.slug, label: l.name }))}
        value={lecturerSlug}
        onChange={setLecturerSlug}
        courses={lecturerCoursesQ.data ?? []}
      />

      {/* Best of — dropdown row */}
      <DropdownRow
        title="Best of"
        icon="ribbon"
        options={feed.bestOf.map((o) => ({ value: o.slug, label: o.name }))}
        value={orgSlug}
        onChange={setOrgSlug}
        courses={activeOrg?.courses ?? []}
      />

      {/* Featured learning paths — franchise-style cards with thumbnail strips */}
      {feed.featuredPaths.length > 0 && (
        <View style={styles.wrap}>
          <SectionHeader title="Featured learning paths" icon="git-branch" href="/paths" />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            data={feed.featuredPaths}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <Press style={styles.pathCard} onPress={goTo(`/paths/${item.id}`)} accessibilityLabel={`Learning path: ${item.title}`}>
                <View style={styles.pathStrip}>
                  {item.courses.slice(0, 4).map((c, i) =>
                    c.thumbnailUrl ? (
                      <Image
                        key={i}
                        source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 140, height: 90 }) ?? undefined }}
                        style={styles.pathThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View key={i} style={[styles.pathThumb, styles.pathThumbFallback]} />
                    ),
                  )}
                </View>
                <Text style={styles.pathEyebrow}>LEARNING PATH</Text>
                <Text style={styles.pathTitle} numberOfLines={1}>{item.title}</Text>
                {/* Was `${avg} ★` inside the joined string below. */}
                <View style={styles.pathMetaRow}>
                  {item.totalVotes > 0 && <Stars value={item.ratingAvg} size={10} />}
                  <Text style={styles.muted} numberOfLines={1}>
                    {item.totalVotes > 0 ? `· ${plural(item.courseCount, "course")}` : plural(item.courseCount, "course")}
                  </Text>
                </View>
              </Press>
            )}
          />
        </View>
      )}

      {/* Explore by category — tiles */}
      {feed.categories.length > 0 && (
        <View style={styles.wrap}>
          <SectionHeader title="Explore by category" icon="grid" href="/browse" />
          <View style={styles.catGrid}>
            {feed.categories.map((c) => (
              <Press
                key={c.slug}
                style={[styles.catTile, { width: catW }]}
                onPress={goTo(`/browse?category=${c.slug}`)}
                accessibilityLabel={`${c.name}, ${plural(c.courseCount, "course")}`}
              >
                {/* Category icons come from the database as emoji, so they stay
                    emoji — but a category with none got a bare 🎓 that read as a
                    missing image. */}
                {c.icon ? (
                  <Text style={styles.catIcon}>{c.icon}</Text>
                ) : (
                  <Ionicons name="school-outline" size={19} color={colors.accent} />
                )}
                <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.catCount}>{plural(c.courseCount, "course")}</Text>
              </Press>
            ))}
          </View>
        </View>
      )}

      {/* Lecturers + Channels & Schools */}
      {feed.lecturers.length > 0 && (
        <PersonRow title="Lecturers" icon="person" seeAllHref="/lecturers" people={feed.lecturers} href={(l) => `/lecturers/${l.slug}`} image={(l) => l.photoUrl} sub={(l) => plural(l.courseCount, "course")} />
      )}
      {feed.organizations.length > 0 && (
        <PersonRow title="Channels & Schools" icon="business" seeAllHref="/organizations" people={feed.organizations} href={(o) => `/organizations/${o.slug}`} image={(o) => o.logoUrl} sub={(o) => plural(o.courseCount, "course")} />
      )}
    </ScrollView>
  );
}

/* ---------- helpers ---------- */

function DropdownRow({
  title,
  icon,
  options,
  value,
  onChange,
  courses,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  courses: CourseSummary[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          {!!icon && <Ionicons name={icon} size={16} color={colors.accent} />}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <View style={styles.dropWrap}>
          <Press
            style={styles.drop}
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${title}: ${current?.label ?? "All"}. Change`}
          >
            <Text style={styles.dropLabel} numberOfLines={1}>
              {current?.label ?? "All"}
            </Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
          </Press>
          {open && (
            <View style={styles.dropMenu}>
              {options.map((o) => (
                <Press
                  key={o.value}
                  style={styles.dropItem}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  accessibilityLabel={o.label}
                  accessibilityState={{ selected: o.value === value }}
                >
                  <Text style={[styles.dropItemLabel, o.value === value && styles.dropItemOn]}>
                    {o.label}
                  </Text>
                  {o.value === value && <Ionicons name="checkmark" size={14} color={colors.accent} />}
                </Press>
              ))}
            </View>
          )}
        </View>
      </View>
      {courses.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.mutedEmpty}>
          Nothing here yet — pick another option.
        </Text>
      )}
    </View>
  );
}

function PersonRow<P extends { id: string; name: string; slug: string }>({
  title,
  icon,
  seeAllHref,
  people,
  href,
  image,
  sub,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  seeAllHref: string;
  people: P[];
  href: (p: P) => string;
  image: (p: P) => string | null;
  sub: (p: P) => string;
}) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} icon={icon} href={seeAllHref} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {people.map((p) => (
          <Press
            key={p.id}
            style={styles.person}
            onPress={() => router.push(href(p) as never)}
            accessibilityLabel={`${p.name}, ${sub(p)}`}
          >
            {image(p) ? (
              <Image source={{ uri: cloudinaryUrl(image(p), { width: 96, height: 96 }) ?? undefined }} style={styles.personPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.personPhoto, styles.personFallback]}>
                <Text style={styles.personInitial}>{p.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.personSub} numberOfLines={1}>{sub(p)}</Text>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 12, paddingBottom: 32 },
  wrap: { marginBottom: 22 },
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
  row: { paddingHorizontal: 16, gap: 12 },
  muted: { color: colors.muted, fontSize: 12 },
  mutedEmpty: { color: colors.muted, fontSize: 12, paddingHorizontal: 16 },

  // hero
  hero: {
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 22,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...elevation[2],
  },
  heroFallback: { backgroundColor: "hsl(32 42% 18%)" },
  heroShade: { ...(StyleSheet.absoluteFill as object), backgroundColor: "rgba(10,9,7,.55)" },
  heroContent: { flex: 1, minWidth: 0, justifyContent: "flex-end", padding: 18 },
  heroEyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, lineHeight: 28 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  heroMetaText: { color: "#cfc6ba", fontSize: 12, flexShrink: 1 },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  heroCtaText: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },

  // dropdown
  dropWrap: { position: "relative", zIndex: 20 },
  drop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  dropLabel: { color: colors.text, fontSize: 12, fontWeight: "700", maxWidth: 150 },
  dropMenu: {
    position: "absolute",
    top: 42,
    right: 0,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 4,
    minWidth: 190,
    ...elevation[3],
  },
  dropItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  dropItemLabel: { color: colors.text, fontSize: 13, flexShrink: 1 },
  dropItemOn: { color: colors.accent, fontWeight: "700" },

  // learning paths
  pathCard: {
    width: 250,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pathStrip: { flexDirection: "row", gap: 4, height: 64 },
  pathThumb: { flex: 1, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  pathThumbFallback: { backgroundColor: "hsl(32 42% 18%)" },
  pathEyebrow: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  pathTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 3 },
  pathMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },

  // categories — width comes from the column count, which follows the screen
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  catTile: {
    minHeight: 92,
    justifyContent: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIcon: { fontSize: 20, lineHeight: 24 },
  catName: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6 },
  catCount: { color: colors.muted, fontSize: 10, marginTop: 2 },

  // people rows
  person: { width: 84, alignItems: "center" },
  personPhoto: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface },
  personFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  personInitial: { color: colors.accent, fontSize: 26, fontWeight: "800" },
  personName: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center" },
  personSub: { color: colors.muted, fontSize: 11, marginTop: 1, textAlign: "center" },
});
