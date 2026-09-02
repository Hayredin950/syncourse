import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Rail, ResourceRail } from "../../components/Rail";
import { CourseCard } from "../../components/CourseCard";
import { cloudinaryUrl } from "../../lib/cloudinary";
import * as api from "../../lib/api";
import { colors, radius } from "../../lib/tokens";
import type { CourseSummary, HomeFeed } from "../../lib/types";

export default function HomeScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["home"],
    queryFn: api.home,
  });
  const [catSlug, setCatSlug] = useState<string>("");
  const [lecturerSlug, setLecturerSlug] = useState<string>("");
  const [orgSlug, setOrgSlug] = useState<string>("");

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
  const goTo = useCallback((href: string) => () => router.push(href as any), [router]);

  // Resources aren't part of /home, which is a course feed. The rail simply
  // doesn't render if this fails or comes back empty, so a library with no
  // cheat-sheets yet costs the home screen nothing.
  const resourcesQ = useQuery({
    queryKey: ["home-resources"],
    queryFn: () => api.resources({ limit: 8 }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not reach the server</Text>
        <Text style={[styles.errorText, { fontSize: 11, color: "#999", marginTop: 4, textAlign: "center" }]}>
          {(error as Error)?.message ?? "No data yet"}
        </Text>
        <Text style={[styles.errorText, { fontSize: 10, color: "#777", marginTop: 2, textAlign: "center" }]}>
          {(((error as any)?.cause as any)?.message || String((error as any)?.cause || ""))?.slice(0, 160)}
        </Text>
        <Pressable onPress={() => refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const feed: HomeFeed = data;

  // dropdown rows — same data the web uses, swapped client-side per selection
  const catCourses = catSlug ? (catCoursesQ.data ?? []) : feed.trending.slice(0, 8);
  const activeOrg = (feed.bestOf ?? []).find((o) => o.slug === orgSlug) ?? feed.bestOf?.[0];
  const hero = feed.trending[0];

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
        <Pressable style={styles.hero} onPress={goTo(`/courses/${hero.slug}`)}>
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
            <Text style={styles.heroMeta} numberOfLines={1}>
              ★ {hero.ratingAvg.toFixed(1)} · {hero.level} · {formatMin(hero.durationMin)}
            </Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Start learning free →</Text>
            </View>
          </View>
        </Pressable>
      )}

      <Rail title="🔥 Trending" courses={feed.trending} href="/browse" />
      <Rail title="✨ Latest added" courses={feed.latest} href="/browse" />
      <Rail title="⭐ Top rated" courses={feed.topRated} href="/browse" />

      <ResourceRail
        title="📄 Cheat-sheets & roadmaps"
        resources={resourcesQ.data?.results ?? []}
        href="/resources"
      />

      {/* Explore by Category — dropdown row (phonofilm: Movie Genre →) */}
      <DropdownRow
        title="Explore by Category"
        options={feed.categories.map((c) => ({ value: c.slug, label: c.name }))}
        value={catSlug}
        onChange={setCatSlug}
        courses={catCourses}
      />

      {/* By Instructor — dropdown row */}
      <DropdownRow
        title="By Instructor"
        options={feed.lecturers.map((l) => ({ value: l.slug, label: l.name }))}
        value={lecturerSlug}
        onChange={setLecturerSlug}
        courses={lecturerCoursesQ.data ?? []}
      />

      {/* Best of — dropdown row */}
      <DropdownRow
        title="Best of"
        options={feed.bestOf.map((o) => ({ value: o.slug, label: o.name }))}
        value={orgSlug}
        onChange={setOrgSlug}
        courses={activeOrg?.courses ?? []}
      />

      {/* Featured learning paths — franchise-style cards with thumbnail strips */}
      {feed.featuredPaths.length > 0 && (
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={styles.title}>Featured learning paths</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            data={feed.featuredPaths}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <Pressable style={styles.pathCard} onPress={goTo(`/paths/${item.id}`)}>
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
                <Text style={styles.muted} numberOfLines={1}>
                  ★ {item.ratingAvg.toFixed(1)} · {item.courseCount} courses · {item.totalVotes} votes
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Explore by category — tiles */}
      {feed.categories.length > 0 && (
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={styles.title}>Explore by category</Text>
            <Link href="/browse" style={styles.seeAll}>See all</Link>
          </View>
          <View style={styles.catGrid}>
            {feed.categories.map((c) => (
              <Pressable key={c.slug} style={styles.catTile} onPress={goTo(`/browse?category=${c.slug}`)}>
                <Text style={styles.catIcon}>{c.icon ?? "🎓"}</Text>
                <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.catCount}>{c.courseCount} courses</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Lecturers + Channels & Schools */}
      {feed.lecturers.length > 0 && (
        <PersonRow title="Lecturers" seeAllHref="/lecturers" people={feed.lecturers} href={(l) => `/lecturers/${l.slug}`} image={(l) => l.photoUrl} sub={(l) => `${l.courseCount} courses`} />
      )}
      {feed.organizations.length > 0 && (
        <PersonRow title="Channels & Schools" seeAllHref="/organizations" people={feed.organizations} href={(o) => `/organizations/${o.slug}`} image={(o) => o.logoUrl} sub={(o) => `${o.courseCount} courses`} />
      )}
    </ScrollView>
  );
}

/* ---------- helpers ---------- */

function formatMin(min: number): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function DropdownRow({
  title,
  options,
  value,
  onChange,
  courses,
}: {
  title: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  courses: CourseSummary[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.dropWrap}>
          <Pressable style={styles.drop} onPress={() => setOpen((o) => !o)}>
            <Text style={styles.dropLabel} numberOfLines={1}>
              {options.find((o) => o.value === value)?.label ?? (options[0]?.label ?? "All")}
            </Text>
            <Text style={styles.dropCaret}>{open ? "▲" : "▼"}</Text>
          </Pressable>
          {open && (
            <View style={styles.dropMenu}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  style={styles.dropItem}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.dropItemLabel, o.value === value && { color: colors.accent, fontWeight: "700" }]}>
                    {o.label}
                  </Text>
                </Pressable>
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

function PersonRow({
  title,
  seeAllHref,
  people,
  href,
  image,
  sub,
}: {
  title: string;
  seeAllHref: string;
  people: { id: string; name: string; slug: string }[];
  href: (p: any) => string;
  image: (p: any) => string | null;
  sub: (p: any) => string;
}) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Link href={seeAllHref} style={styles.seeAll}>See all</Link>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {people.map((p) => (
          <Pressable key={p.id} style={styles.person} onPress={() => router.push(href(p) as any)}>
            {image(p) ? (
              <Image source={{ uri: cloudinaryUrl(image(p), { width: 96, height: 96 }) ?? undefined }} style={styles.personPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.personPhoto, styles.personFallback]}>
                <Text style={styles.personInitial}>{p.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.muted} numberOfLines={1}>{sub(p)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 12, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 10 },
  errorText: { color: colors.muted, fontSize: 14 },
  retry: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginTop: 6,
  },
  retryText: { color: colors.accent, fontWeight: "700" },
  wrap: { marginBottom: 22 },
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
  muted: { color: colors.muted, fontSize: 12, paddingHorizontal: 16 },
  mutedEmpty: { color: colors.muted, fontSize: 12, paddingHorizontal: 16 },

  // hero
  hero: { height: 240, borderRadius: 18, marginHorizontal: 16, marginBottom: 22, overflow: "hidden", backgroundColor: colors.surface },
  heroFallback: { backgroundColor: "hsl(32 42% 18%)" },
  heroShade: { ...(StyleSheet.absoluteFill as object), backgroundColor: "rgba(10,9,7,.55)" },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: 18 },
  heroEyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, lineHeight: 28 },
  heroMeta: { color: "#cfc6ba", fontSize: 12, marginTop: 6 },
  heroCta: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
  },
  heroCtaText: { color: "#211308", fontSize: 12, fontWeight: "800" },

  // dropdown
  dropWrap: { position: "relative", zIndex: 20 },
  drop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  dropLabel: { color: colors.text, fontSize: 12, fontWeight: "700", maxWidth: 150 },
  dropCaret: { color: colors.accent, fontSize: 9 },
  dropMenu: {
    position: "absolute",
    top: 34,
    right: 0,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 9 },
  dropItemLabel: { color: colors.text, fontSize: 13 },

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
  pathThumb: { flex: 1, borderRadius: 6 },
  pathThumbFallback: { backgroundColor: "hsl(32 42% 18%)" },
  pathEyebrow: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  pathTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 3 },

  // categories
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  catTile: {
    width: "31%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIcon: { fontSize: 20 },
  catName: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6 },
  catCount: { color: colors.muted, fontSize: 10, marginTop: 2 },

  // people rows
  person: { width: 84, alignItems: "center" },
  personPhoto: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface },
  personFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
  personInitial: { color: colors.accent, fontSize: 26, fontWeight: "800" },
  personName: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center" },
});
