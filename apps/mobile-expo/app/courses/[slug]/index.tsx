import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { cloudinaryUrl } from "../../../lib/cloudinary";
import { Image, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "../../../components/Type";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as api from "../../../lib/api";
import { AddToListSheet } from "../../../components/AddToListSheet";
import { Failed } from "../../../components/Empty";
import { Note } from "../../../components/Note";
import { Press } from "../../../components/Press";
import { Sheet } from "../../../components/Sheet";
import { SkCourse } from "../../../components/Skeleton";
import { colors, radius } from "../../../lib/tokens";
import { formatDurationSec, isOpaqueFileName, mediaTitle, plural, type Category, type CourseDetail, type CourseSummary, type Review, type TelegramFile } from "../../../lib/types";
import { Stars, StarPicker, StarRow } from "../../../components/StarRating";

const BOT_USERNAME = "syncourse_bot";

/**
 * Bot deep links.
 *
 * `dl_<slug>` opens the bot's picker for the whole course — what "Download all"
 * still does. `dlf_<linkId>` sends exactly one attachment and `dlmod_<linkId>`
 * sends the module that attachment belongs to; both address a
 * `TelegramCourseLink` id because a `/start` payload is capped at 64 characters.
 */
const botLink = (payload: string) => `https://t.me/${BOT_USERNAME}?start=${payload}`;

/**
 * Regroup the flat attachment list into the modules the bot delivers, the same
 * way the website does — a 3-part course listed flat gave no clue which parts
 * belonged together, and no way to ask for one module rather than all of it.
 */
function groupTelegramFiles(files: TelegramFile[]) {
  const groups: { key: string; title: string | null; files: TelegramFile[]; sizeMb: number }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  const sorted = [...files].sort(
    (a, b) => (a.moduleOrder ?? 0) - (b.moduleOrder ?? 0) || a.partIndex - b.partIndex,
  );
  for (const f of sorted) {
    const key = f.moduleTitle ?? "__ungrouped__";
    let g = byKey.get(key);
    if (!g) {
      g = { key, title: f.moduleTitle, files: [], sizeMb: 0 };
      byKey.set(key, g);
      groups.push(g);
    }
    g.files.push(f);
    g.sizeMb += f.fileSizeMb ?? 0;
  }
  return groups;
}

export default function CourseDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => api.courseDetail(slug!),
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
  });

  /**
   * Saved, liked, the like tally and your own stars all come with the course now.
   *
   * Both icons used to be permanently unfilled: the screen fired the toggle and
   * never looked at the answer, so a saved course looked unsaved on every visit
   * and a second tap silently un-saved it. That was first patched by scanning the
   * cached `/me/learning` list, which worked but could only answer for courses
   * that fit in the library page it happens to hold. The detail payload answers
   * for this course directly, in the request the screen already makes.
   */
  const [saved, setSaved] = useState<boolean | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  /* Both cover failures used to be an Alert.alert — an OS dialog thrown on top of
     the sheet that is already asking for one thing. */
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const courseId = data?.id;
  useEffect(() => {
    if (!data) return;
    setSaved(data.saved);
    setLiked(data.liked);
    setLikeCount(data.likeCount);
    setMyRating(data.myRating);
  }, [data]);

  // Both toggles answer with the state they left behind, so the icon settles on
  // the truth even if the tap raced another device.
  const saveMut = useMutation({
    mutationFn: () => api.toggleSave(slug!),
    onSuccess: (r) => {
      setSaved(r.saved);
      queryClient.invalidateQueries({ queryKey: ["my-library"] });
    },
  });
  const likeMut = useMutation({
    mutationFn: () => api.toggleLike(slug!),
    onSuccess: (r) => {
      setLiked(r.liked);
      setLikeCount(r.likeCount);
      queryClient.invalidateQueries({ queryKey: ["my-library"] });
    },
  });
  const rateMut = useMutation({
    mutationFn: (stars: number) => api.rateCourse(slug!, stars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const reviewMut = useMutation({
    mutationFn: (body: { text: string; spoilers: boolean }) => api.postReview(slug!, body.text, body.spoilers),
    // Clearing the box is the only confirmation the reader gets: leaving the
    // text sitting there after a successful post reads as a failure.
    onSuccess: () => {
      setReviewText("");
      setSpoilers(false);
      queryClient.invalidateQueries({ queryKey: ["course", slug] });
    },
  });
  const upvoteMut = useMutation({
    mutationFn: (id: string) => api.toggleUpvote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });

  /**
   * An author's edit or delete is patched into the cached course rather than
   * refetched. A refetch would drop the reader back at the top of a screen they
   * had scrolled down to read — and the row they just changed is the one thing
   * they are looking at.
   *
   * Both walk the top level and each reply list, because a reply is a review row
   * with a parent and the two paths are otherwise identical.
   */
  const patchReviewRow = (id: string, body: string, editedAt: string | null) =>
    queryClient.setQueryData<CourseDetail>(["course", slug], (prev) =>
      prev
        ? {
            ...prev,
            reviews: prev.reviews.map((rv) =>
              rv.id === id
                ? { ...rv, body, editedAt }
                : { ...rv, replies: rv.replies?.map((rep) => (rep.id === id ? { ...rep, body, editedAt } : rep)) },
            ),
          }
        : prev,
    );

  const dropReviewRow = (id: string) =>
    queryClient.setQueryData<CourseDetail>(["course", slug], (prev) => {
      if (!prev) return prev;
      if (prev.reviews.some((rv) => rv.id === id)) {
        return { ...prev, reviews: prev.reviews.filter((rv) => rv.id !== id) };
      }
      return {
        ...prev,
        reviews: prev.reviews.map((rv) =>
          rv.replies?.some((rep) => rep.id === id)
            ? {
                ...rv,
                replies: rv.replies.filter((rep) => rep.id !== id),
                replyCount: Math.max(0, rv.replyCount - 1),
              }
            : rv,
        ),
      };
    });

  /** Signed out, these all 401 in silence — send them to sign in instead. */
  const gated =
    <A extends unknown[]>(run: (...args: A) => void) =>
    (...args: A) => {
      if (!me) {
        router.push("/auth");
        return;
      }
      run(...args);
    };

  const similarQ = useQuery({
    queryKey: ["similar", slug],
    queryFn: async () => {
      const c = data;
      if (!c) return [] as CourseSummary[];
      const cat = c.categoryNames?.[0];
      const cats = await api.categories().catch(() => [] as Category[]);
      const catSlug = cats.find((x) => x.name === cat)?.slug ?? cat;
      const r = await api.browse({ category: catSlug, limit: 8 }).catch(() => ({ results: [] as CourseSummary[] }));
      const filtered = r.results.filter((x) => x.id !== c.id);
      if (filtered.length >= 4) return filtered;
      const firstTeacher = c.lecturers?.[0] ?? c.lecturer;
      if (firstTeacher?.slug) {
        const r2 = await api.browse({ lecturer: firstTeacher.slug, limit: 8 }).catch(() => ({ results: [] as CourseSummary[] }));
        const f2 = r2.results.filter((x) => x.id !== c.id);
        if (f2.length >= 4) return f2;
      }
      return filtered;
    },
    enabled: !!data,
  });

  // Above the early returns on purpose: a hook that only runs once the course
  // has loaded changes the hook count between renders.
  const fileModules = useMemo(() => groupTelegramFiles(data?.telegramFiles ?? []), [data]);

  const coverMut = useMutation({
    mutationFn: async (input: { dataUrl?: string; imageUrl?: string }) => {
      const up = await api.uploadImage(input);
      await api.setCourseCover(slug!, up.url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", slug] });
      setCoverOpen(false);
      setCoverUrl("");
      setCoverErr(null);
    },
    onError: (e: any) => setCoverErr(e?.message || "The upload did not go through. Try again."),
  });

  const closeCover = () => {
    setCoverOpen(false);
    setCoverErr(null);
  };

  const pickFromGallery = async () => {
    setCoverErr(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setCoverErr("Photo access is off for Syncourse. Turn it on in Settings to pick a cover.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    coverMut.mutate({ dataUrl: `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` });
  };

  const uploadFromUrl = () => {
    if (!coverUrl.trim()) return;
    setCoverErr(null);
    coverMut.mutate({ imageUrl: coverUrl.trim() });
  };

  // error before !data: on failure data is undefined, so checking !data first
  // made this branch unreachable and left a permanent spinner
  if (error) {
    return (
      <View style={styles.dead}>
        <Failed
          title="Could not load this course"
          body={
            (error as api.ApiError | null)?.status === 404
              ? "It may have been unpublished since you last saw it."
              : "Check your connection and try again."
          }
          onRetry={() => refetch()}
        />
        {/* `replace`, not `push`: Back from a course that would not load returns
            to the same dead screen, so this one gives up its place in the stack. */}
        <Press
          style={styles.ghostWide}
          onPress={() => router.replace("/browse" as never)}
          accessibilityLabel="Browse all courses"
        >
          <Ionicons name="grid-outline" size={14} color={colors.text} />
          <Text style={styles.ghostWideLabel}>Browse all courses</Text>
        </Press>
      </View>
    );
  }
  if (isLoading || !data) return <SkCourse />;

  const c = data;
  // Most Syncourse courses are a Telegram archive with no lessons at all, so
  // the first openable lesson may live in any section — or nowhere.
  const firstLesson = c.sections.find((s) => s.lessons[0])?.lessons[0] ?? null;
  // A Telegram import creates one lesson-less Section per module just so the
  // course has some structure; rendering those gave "0 lessons · 0:00" rows that
  // only repeated the Course Materials list.
  const curriculum = c.sections.filter((s) => s.lessons.length > 0);
  // A course can be taught by several people; `lecturer` is the older single
  // field, kept so the screen still names someone against an older API.
  const teachers = c.lecturers?.length ? c.lecturers : c.lecturer ? [c.lecturer] : [];
  // A 210px band is a letterbox strip on a tablet and half the screen on a
  // small phone; tie it to the width and cap it so the title stays above the fold.
  const bannerH = Math.min(320, Math.round(width * 0.52));
  const rated = c.ratings.count > 0;
  const totalDownloads = c.downloads?.total ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      /* Was a flat 40: on a gesture-bar phone the last row of the page sat
         under the bar with nothing below it to scroll into view. */
      contentContainerStyle={{ paddingBottom: Math.max(40, insets.bottom + 28) }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      {/* The header bar was blank on this screen; once the banner scrolls away
          there was nothing on screen naming the course. */}
      <Stack.Screen options={{ title: c.title }} />
      <View style={styles.bannerWrap}>
        {/* Both branches used to render: a source-less <Image> *and* the fallback
            below it, so a cover-less course got a double-height grey band. */}
        {c.bannerUrl || c.thumbnailUrl ? (
          <Image
            source={{ uri: cloudinaryUrl(c.bannerUrl || c.thumbnailUrl, { width: 840, height: 420 }) ?? undefined }}
            style={[styles.banner, { height: bannerH }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.banner, styles.bannerFallback, { height: bannerH }]}>
            <Ionicons name="play" size={40} color={colors.dim} />
          </View>
        )}
        {me?.isStaff && (
          <Press style={styles.editCoverBtn} onPress={() => setCoverOpen(true)} accessibilityLabel="Edit cover">
            <Ionicons name="create-outline" size={13} color="#fff" />
            <Text style={styles.editCoverLabel}>{coverMut.isPending ? "Uploading…" : "Edit cover"}</Text>
          </Press>
        )}
      </View>

      {/* Was its own Modal held open by a `stopPropagation` on the card, with a
          hard-coded bottom pad and no close button — the way out was the Cancel
          row or a lucky tap on the backdrop. */}
      <Sheet
        visible={coverOpen}
        onClose={closeCover}
        title="Change course cover"
        subtitle="Pick an image from this phone, or paste a URL Syncourse can fetch."
        footer={
          <Press
            style={[styles.sheetPrimary, !coverUrl.trim() && styles.sheetPrimaryOff]}
            disabled={!coverUrl.trim() || coverMut.isPending}
            onPress={uploadFromUrl}
            haptic
            accessibilityLabel="Use this URL"
          >
            <Text style={[styles.sheetPrimaryLabel, !coverUrl.trim() && styles.sheetPrimaryLabelOff]}>
              {coverMut.isPending ? "Uploading…" : "Use this URL"}
            </Text>
          </Press>
        }
      >
        <Press
          style={styles.coverOption}
          onPress={pickFromGallery}
          disabled={coverMut.isPending}
          accessibilityLabel="Choose from gallery"
        >
          <Ionicons name="images-outline" size={17} color={colors.accent} />
          <Text style={styles.coverOptionText}>Choose from gallery</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.dim} />
        </Press>
        <View style={styles.orRow}>
          <View style={styles.rule} />
          <Text style={styles.or}>OR</Text>
          <View style={styles.rule} />
        </View>
        <TextInput
          value={coverUrl}
          onChangeText={setCoverUrl}
          placeholder="https://…"
          placeholderTextColor={colors.dim}
          style={styles.coverInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={uploadFromUrl}
        />
        {!!coverErr && <Note bad text={coverErr} style={styles.coverErr} />}
      </Sheet>

      <View style={styles.body}>
        <Text style={styles.title}>{c.title}</Text>
        <View style={styles.metaRow}>
          {/* single-ZIP courses have no lessons and no ratings; printing the
              zeros made a complete course look empty (web guards these too) */}
          {c.ratingCount > 0 ? (
            <>
              <Stars value={c.ratingAvg} />
              <Text style={styles.metaInline}> · {c.ratingCount} ratings</Text>
            </>
          ) : (
            <Text style={styles.metaInline}>Not yet rated</Text>
          )}
          <View style={{ flex: 1 }} />
          {c.lessonCount > 0 && <Text style={styles.metaInline}>{c.lessonCount} lessons</Text>}
        </View>
        {/* "0 downloads" on a course nobody has pulled yet is a worse first
            impression than a shorter line. */}
        <Text style={styles.metaText}>
          {[c.level, c.language, c.downloadCount > 0 ? `${c.downloadCount.toLocaleString()} downloads` : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {c.isPremium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="ribbon" size={11} color={colors.accent} />
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        )}

        <View style={styles.tagRow}>
          {c.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* numberOfLines rather than a 200-character slice: the slice cut words
            in half and, on a wide screen, clamped text that already fitted. */}
        <Text style={styles.desc} numberOfLines={expanded ? undefined : 5}>
          {c.description}
        </Text>
        {c.description.length > 180 && (
          /* The label was a bare Text inside a Press with no height of its own —
             about 18px of target for the control that reveals the description. */
          <Press
            style={styles.readMoreBtn}
            onPress={() => setExpanded(!expanded)}
            accessibilityLabel={expanded ? "Show less" : "Read more"}
            accessibilityState={{ expanded }}
          >
            <Text style={styles.readMore}>{expanded ? "Show less" : "Read more"}</Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
          </Press>
        )}

        <View style={styles.actions}>
          <View style={styles.ctaGroup}>
            {/* The archive *is* the course, so downloading is the primary action
                whenever there are no lessons to open in the app. */}
            {firstLesson ? (
              <>
                <Link href={`/courses/${c.slug}/lessons/${firstLesson.id}`} asChild>
                  <Press style={styles.primaryBtn} accessibilityLabel="Start course">
                    <Ionicons name="play" size={15} color={colors.onAccent} />
                    <Text style={styles.primaryLabel}>Start course</Text>
                  </Press>
                </Link>
                <Press style={styles.secondaryBtn} onPress={() => setDownloadsOpen(true)} accessibilityLabel="Download">
                  <Ionicons name="download-outline" size={15} color={colors.text} />
                  <Text style={styles.secondaryLabel}>Download</Text>
                </Press>
              </>
            ) : (
              <Press style={styles.primaryBtn} onPress={() => setDownloadsOpen(true)} accessibilityLabel="Download">
                <Ionicons name="download-outline" size={16} color={colors.onAccent} />
                <Text style={styles.primaryLabel}>Download</Text>
              </Press>
            )}
          </View>
          {/* These three were <Text onPress>: no press state, no button role for
              a screen reader, and a 16px tap target instead of 44. */}
          <View style={styles.iconGroup}>
            <Press
              style={[styles.iconBtn, saved && styles.iconBtnOn]}
              onPress={gated(() => saveMut.mutate())}
              haptic
              accessibilityLabel={saved ? "Remove from saved" : "Save this course"}
              accessibilityState={{ selected: !!saved }}
            >
              <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color={saved ? colors.accent : colors.text} />
            </Press>
            <Press
              style={[styles.iconBtn, liked && styles.iconBtnOn, likeCount > 0 && styles.iconBtnWide]}
              onPress={gated(() => likeMut.mutate())}
              haptic
              accessibilityLabel={
                liked
                  ? `Remove like. ${likeCount} ${likeCount === 1 ? "like" : "likes"}`
                  : `Like this course. ${likeCount} ${likeCount === 1 ? "like" : "likes"}`
              }
              accessibilityState={{ selected: !!liked }}
            >
              <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? colors.accent : colors.text} />
              {/* The tally is the point of the button once anyone has pressed it —
                  a filled heart says what you did, the number says what everyone
                  else did. Hidden at zero rather than showing a bare "0". */}
              {likeCount > 0 && (
                <Text style={[styles.iconBtnCount, liked && styles.iconBtnCountOn]}>{likeCount}</Text>
              )}
            </Press>
            {/* Saving keeps a course to yourself; a list is how you group them and
                hand the group to someone else. */}
            <Press style={styles.iconBtn} onPress={gated(() => setListOpen(true))} accessibilityLabel="Add to a collection">
              <Ionicons name="albums-outline" size={18} color={colors.text} />
            </Press>
          </View>
        </View>

        {totalDownloads > 0 && (
          <View style={styles.downloadsCard}>
            <Text style={styles.downloadsLabel}>DOWNLOADS ON SYNCOURSE</Text>
            {/* Four figures used to run together in one grey sentence — "12 total ·
                3 last 30 days · 1 last 7 days · 0 today" — where the numbers are
                the point and the words are only their labels. */}
            <View style={styles.dlGrid}>
              {[
                { label: "Total", value: c.downloads.total },
                { label: "30 days", value: c.downloads.last30 },
                { label: "7 days", value: c.downloads.last7 },
                { label: "Today", value: c.downloads.today },
              ].map((d) => (
                <View key={d.label} style={styles.dlCell}>
                  <Text style={styles.dlValue}>{d.value.toLocaleString()}</Text>
                  <Text style={styles.dlLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {teachers.length > 0 && (
          <>
            <Text style={styles.heading}>{teachers.length > 1 ? "Lecturers" : "Lecturer"}</Text>
            {teachers.map((l) => (
              <Press key={l.id} style={styles.lecturerRow} onPress={() => router.push(`/lecturers/${l.slug}`)} accessibilityLabel={l.name}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{l.name.charAt(0)}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.lecturerName}>{l.name}</Text>
                  {(l.credentials || l.bio) && (
                    <Text style={styles.muted} numberOfLines={2}>
                      {[l.credentials, l.bio].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.dim} />
              </Press>
            ))}
          </>
        )}

        {c.organization && (
          <>
            <Text style={styles.heading}>Organization</Text>
            <Press
              style={styles.lecturerRow}
              onPress={() => c.organization && router.push(`/organizations/${c.organization.slug}`)}
              accessibilityLabel={c.organization.name}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.organization.name.charAt(0)}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.lecturerName}>{c.organization.name}</Text>
                <Text style={styles.muted}>See all courses</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.dim} />
            </Press>
          </>
        )}

        {/* hidden for archive courses, which have no lessons to open in the app —
            a bare "Curriculum" heading over blank space read as broken */}
        {curriculum.length > 0 && (
          <>
            <Text style={styles.heading}>Curriculum</Text>
            {curriculum.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {section.title}{" "}
                  <Text style={styles.muted}>
                    · {plural(section.lessons.length, "lesson")} · {formatDurationSec(section.lessons.reduce((s, l) => s + l.durationSec, 0))}
                  </Text>
                </Text>
                {section.lessons.map((lesson) => (
                  // asChild: without it the Link renders a <Text>, so the icon,
                  // title and duration collapsed into one inline run instead of
                  // a row with the duration pinned right.
                  <Link key={lesson.id} href={`/courses/${c.slug}/lessons/${lesson.id}`} asChild>
                    <Press style={styles.lessonRow} accessibilityLabel={lesson.title}>
                      <Ionicons
                        name={lesson.type === "video" ? "play-circle-outline" : "document-text-outline"}
                        size={15}
                        color={colors.dim}
                      />
                      <Text style={styles.lessonTitle} numberOfLines={1}>
                        {lesson.title}
                      </Text>
                      <Text style={styles.muted}>{formatDurationSec(lesson.durationSec)}</Text>
                    </Press>
                  </Link>
                ))}
              </View>
            ))}
          </>
        )}

        <Text style={styles.heading}>How it&apos;s rated</Text>
        <View style={styles.ratingCard}>
          {/* An unrated course used to head this card with a 32px "0.0" over
              "0 community ratings", under five empty bars. Ask for the first
              rating instead of reporting the absence of any. */}
          {rated ? (
            <>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewAvg}>{c.ratings.avg.toFixed(1)}</Text>
                <View style={styles.rowText}>
                  <StarRow value={c.ratings.avg} size={14} />
                  <Text style={styles.muted}>{plural(c.ratings.count, "community rating")}</Text>
                </View>
              </View>
              {[5, 4, 3, 2, 1].map((n) => {
                const count = c.ratings.distribution[n] ?? 0;
                const max = Math.max(1, ...Object.values(c.ratings.distribution));
                return (
                  <View key={n} style={styles.distRow}>
                    {/* Was "{n}★". Manrope has no star glyph, so the row fell back
                        to a system font for one character and sat off-baseline. */}
                    <View style={styles.distLabel}>
                      <Text style={styles.distNum}>{n}</Text>
                      <Ionicons name="star" size={9} color={colors.star} />
                    </View>
                    <View style={styles.distTrack}>
                      <View style={[styles.distFill, { width: `${(count / max) * 100}%` }]} />
                    </View>
                    <Text style={styles.distCount}>{count}</Text>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={styles.notRated}>No ratings yet. Yours would be the first.</Text>
          )}
          <View style={[styles.rateRow, !rated && styles.rateRowBare]}>
            <Text style={styles.muted}>
              {myRating > 0 ? "Your rating" : rateMut.isPending ? "Saving…" : "Rate this course"}
            </Text>
            {/* setMyRating was never called, so the stars sprang back to empty
                the instant the request returned and there was no way to tell a
                saved rating from a lost one. */}
            <StarPicker
              value={myRating}
              onChange={gated((s: number) => {
                setMyRating(s);
                rateMut.mutate(s);
              })}
            />
          </View>
        </View>

        <Text style={styles.heading}>
          Reviews{c.reviews.length > 0 ? ` · ${c.reviews.length}` : ""}
        </Text>
        {/* The form used to render signed out too, then throw the typed review
            away on a 401. */}
        {me ? (
          <View style={styles.reviewForm}>
            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share a thought…"
              placeholderTextColor={colors.dim}
              multiline
              style={styles.reviewInput}
            />
            <View style={styles.reviewFormRow}>
              <View style={styles.spoilerRow}>
                <Text style={styles.muted}>Contains spoilers</Text>
                <Switch value={spoilers} onValueChange={setSpoilers} trackColor={{ true: colors.accent, false: colors.border }} />
              </View>
              <Press
                style={styles.postBtn}
                disabled={!reviewText.trim() || reviewMut.isPending}
                onPress={() => reviewMut.mutate({ text: reviewText, spoilers })}
                haptic="success"
                accessibilityLabel="Post review"
              >
                <Text style={styles.postLabel}>{reviewMut.isPending ? "Posting…" : "Post review"}</Text>
              </Press>
            </View>
          </View>
        ) : (
          <Press style={styles.signInRow} onPress={() => router.push("/auth")} accessibilityLabel="Sign in to review">
            <Ionicons name="create-outline" size={15} color={colors.accent} />
            <Text style={styles.signInText}>Sign in to leave a review</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </Press>
        )}
        {c.reviews.length === 0 && (
          /* Was a bare grey sentence hanging under the form with nothing around
             it, which reads as a loading state rather than an invitation. */
          <View style={styles.noReviews}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.dim} />
            <Text style={styles.noReviewsText}>
              No reviews yet — yours would be the first thing the next reader sees.
            </Text>
          </View>
        )}
        {c.reviews.map((r) => (
          <View key={r.id} style={styles.review}>
            <View style={styles.reviewTop}>
              <View style={[styles.avatar, styles.smallAvatar]}>
                <Text style={styles.avatarText}>{r.userName.charAt(0)}</Text>
              </View>
              <Text style={styles.reviewer}>{r.userName}</Text>
              {r.rating > 0 && <StarRow value={r.rating} size={10} />}
              {r.isStaff && (
                <View style={styles.editorial}>
                  <Text style={styles.editorialText}>EDITORIAL</Text>
                </View>
              )}
            </View>
            {r.body && <Text style={styles.reviewBody}>{r.body}</Text>}
            {r.editedAt && <Text style={styles.ownEdited}>edited</Text>}
            <View style={styles.reviewFooter}>
              <Press
                style={styles.actionBtn}
                onPress={gated(() => upvoteMut.mutate(r.id))}
                haptic
                accessibilityLabel={r.upvoted ? "Remove upvote" : "Upvote this review"}
              >
                <Ionicons
                  name={r.upvoted ? "arrow-up-circle" : "arrow-up-circle-outline"}
                  size={15}
                  color={r.upvoted ? colors.accent : colors.muted}
                />
                <Text style={[styles.actionLabel, r.upvoted && styles.upvoted]}>{r.upvotes ?? 0}</Text>
              </Press>
              {/* "0 replies" on every review is noise on the commonest case. */}
              {r.replyCount > 0 && (
                <Text style={styles.muted}>{plural(r.replyCount, "reply", "replies")}</Text>
              )}
            </View>
            {r.mine && (
              <ReviewOwnControls row={r} onEdited={patchReviewRow} onDeleted={dropReviewRow} />
            )}
            {/* the API nests reply bodies under each review — render them instead
                of only a counter the reader can never open */}
            {(r.replies ?? []).map((rep) => (
              <View key={rep.id} style={styles.replyRow}>
                <Text style={styles.replyAuthor}>
                  {rep.userName}
                  {rep.isStaff ? " · staff" : ""}
                </Text>
                {rep.body && <Text style={styles.replyBody}>{rep.body}</Text>}
                {rep.editedAt && <Text style={styles.ownEdited}>edited</Text>}
                {rep.mine && (
                  <ReviewOwnControls row={rep} small onEdited={patchReviewRow} onDeleted={dropReviewRow} />
                )}
              </View>
            ))}
          </View>
        ))}

        {/* downloads — bulk module + per-lesson (phonofilm: season download).
            Lessons only: an archive course has none, and Course Materials above
            is already the real download surface. */}
        {curriculum.length > 0 && (
        <View style={styles.downloadsBox}>
          <View style={styles.downloadsHead}>
            <Text style={styles.heading}>Downloads</Text>
            <Press onPress={() => setDownloadsOpen(true)} style={styles.seeAllBtn} accessibilityLabel="All lessons">
              <Text style={styles.seeAll}>All lessons</Text>
              <Ionicons name="download-outline" size={14} color={colors.accent} />
            </Press>
          </View>
          <Text style={styles.muted}>
            Grab a whole module at once or pick individual lessons. Premium gets full-speed delivery.
          </Text>
          {curriculum.slice(0, 3).map((s, si) => (
            <View key={s.id} style={styles.bulkRow}>
              <Text style={styles.bulkText} numberOfLines={1}>
                Module {si + 1} — {s.title}
              </Text>
              <Text style={styles.muted}>{plural(s.lessons.length, "lesson")}</Text>
              {/* `?bulk=1` was read by nothing and an empty lessons[0] navigated
                  to /lessons/ with a blank id, which hung on a spinner */}
              {s.lessons[0] && (
                <Link href={`/courses/${c.slug}/lessons/${s.lessons[0].id}`} asChild>
                  <Press style={styles.bulkBtn} accessibilityLabel={`Open module ${si + 1}`}>
                    <Text style={styles.bulkBtnLabel}>Open</Text>
                  </Press>
                </Link>
              )}
            </View>
          ))}
        </View>
        )}

        {/* Telegram files — the actual course materials linked via the bot */}
        {c.telegramFiles && c.telegramFiles.length > 0 && (
          <View style={styles.section2}>
            <View style={styles.downloadsHead}>
              <Text style={styles.heading}>Course Materials</Text>
              <Press style={styles.bulkBtn} onPress={() => Linking.openURL(botLink(`dl_${c.slug}`))} haptic accessibilityLabel="Download all parts">
                <Ionicons name="download" size={12} color={colors.onAccent} />
                <Text style={styles.bulkBtnLabel}>Download all</Text>
              </Press>
            </View>
            <Text style={styles.materialsNote}>
              Tap a part and the bot sends only that file. “Download all” asks it for everything.
            </Text>
            {fileModules.map((m, mi) => (
              <View key={m.key} style={styles.fileModule}>
                <View style={styles.fileModuleHead}>
                  <Text style={styles.fileModuleIndex}>{String(mi + 1).padStart(2, "0")}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.fileModuleTitle} numberOfLines={2}>
                      {m.title ?? "Course archive"}
                    </Text>
                    <Text style={styles.fileModuleMeta}>
                      {plural(m.files.length, "part")}
                      {m.sizeMb > 0 ? ` · ${Math.round(m.sizeMb)} MB` : ""}
                    </Text>
                  </View>
                  {/* One tap for the whole module — addressed through any part it
                      holds, since the bot resolves the module from the link id. */}
                  {m.files.length > 1 && (
                    <Press
                      style={styles.ghostBtn}
                      onPress={() => Linking.openURL(botLink(`dlmod_${m.files[0].id}`))}
                      haptic
                      accessibilityLabel={`All parts of ${m.title ?? "the course archive"}`}
                    >
                      <Text style={styles.ghostBtnLabel}>All parts</Text>
                    </Press>
                  )}
                </View>
                {m.files.map((file) => (
                  <View key={file.id} style={styles.lessonDownload}>
                    <Text style={styles.filePartNum}>{String(file.partIndex).padStart(2, "0")}</Text>
                    <View style={styles.rowText}>
                      <Text style={styles.fileName} numberOfLines={2}>
                        {mediaTitle(file, `Part ${file.partIndex}`)}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {file.fileSizeMb ? `${file.fileSizeMb} MB` : "Telegram attachment"}
                      </Text>
                    </View>
                    <Press
                      style={styles.bulkBtn}
                      haptic
                      accessibilityLabel={`Download part ${file.partIndex}`}
                      onPress={() => {
                        // One part per button: the bot delivers this attachment alone,
                        // so nobody pulls 300 MB to re-fetch the one part that failed.
                        Linking.openURL(botLink(`dlf_${file.id}`));
                      }}
                    >
                      <Ionicons name="download" size={12} color={colors.onAccent} />
                      <Text style={styles.bulkBtnLabel}>Part {file.partIndex}</Text>
                    </Press>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* More like this (phonofilm: 12-item related rail) */}
        {similarQ.data && similarQ.data.length > 0 && (
          <View style={styles.section2}>
            <View style={styles.downloadsHead}>
              <Text style={styles.heading}>More like this</Text>
            </View>
            {/* No paddingHorizontal of its own: `body` already insets 16, so the
                rail was starting 32px in and could not scroll to either edge. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarRow}>
              {similarQ.data.map((sc) => (
                <Press key={sc.id} style={styles.similarCard} onPress={() => router.push(`/courses/${sc.slug}`)} accessibilityLabel={sc.title}>
                  {sc.thumbnailUrl ? (
                    <Image source={{ uri: cloudinaryUrl(sc.thumbnailUrl, { width: 264, height: 352 }) ?? undefined }} style={styles.similarThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.similarThumb, styles.similarFallback]}>
                      <Ionicons name="play" size={18} color={colors.dim} />
                    </View>
                  )}
                  <Text numberOfLines={2} style={styles.similarTitle}>{sc.title}</Text>
                </Press>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Was a hand-rolled Modal: a backdrop Pressable, an inner Pressable held
          open by `stopPropagation`, a hard-coded bottom pad, and a "Done" text
          link where the shared sheet has a real 34px close button. */}
      <Sheet
        visible={downloadsOpen}
        onClose={() => setDownloadsOpen(false)}
        title="Available downloads"
        subtitle="Lesson files come through short-lived signed links. Premium gets full-speed delivery."
        footer={
          /* Telegram is how a course actually arrives, so it is pinned rather
             than left to scroll away above a long module list. */
          <Press
            style={styles.sheetPrimary}
            onPress={() => Linking.openURL(botLink(`dl_${c.slug}`))}
            haptic
            accessibilityLabel="Get the whole course on Telegram"
          >
            <Ionicons name="paper-plane" size={15} color={colors.onAccent} />
            <Text style={styles.sheetPrimaryLabel}>Get it all on Telegram</Text>
          </Press>
        }
      >
        {!c.telegramFiles?.length && curriculum.length === 0 && (
          <Text style={styles.sheetNote}>
            Nothing is listed part by part for this course yet — the bot sends the whole
            archive in one go.
          </Text>
        )}

        {/* Telegram-linked files */}
        {c.telegramFiles && c.telegramFiles.length > 0 && (
          <View>
            <Text style={styles.sheetGroupLabel}>LINKED FROM TELEGRAM</Text>
            {c.telegramFiles.map((f) => (
              <Press
                key={f.id}
                style={styles.lessonDownload}
                onPress={() => Linking.openURL(botLink(`dlf_${f.id}`))}
                haptic
                accessibilityLabel={f.moduleTitle ? `${f.moduleTitle}, part ${f.partIndex}` : `Part ${f.partIndex}`}
              >
                <Ionicons name="download-outline" size={15} color={colors.dim} />
                <View style={styles.rowText}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {f.moduleTitle ? `${f.moduleTitle} · Part ${f.partIndex}` : `Part ${f.partIndex}`}
                  </Text>
                  {/* These facts were crammed into one <Text> with no separators,
                      so a filename ran straight into its size. A storage key is
                      dropped rather than printed — it names nothing. */}
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {[
                      f.fileName && !isOpaqueFileName(f.fileName) ? f.fileName : null,
                      f.fileSizeMb ? `${f.fileSizeMb} MB` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </Press>
            ))}
          </View>
        )}

        {curriculum.map((s, si) => (
          <View key={s.id} style={styles.sheetGroup}>
            {/* Was a <Link> nested inside a <Pressable>, both handling the
                tap: the outer one closed the sheet while the inner one
                navigated, and the Link's flex row laid out as inline text. */}
            <Link
              href={s.lessons[0] ? `/courses/${c.slug}/lessons/${s.lessons[0].id}` : `/courses/${c.slug}`}
              asChild
            >
              <Press
                style={styles.bulkDownload}
                onPress={() => setDownloadsOpen(false)}
                accessibilityLabel={`Module ${si + 1}, ${s.title}`}
              >
                <Ionicons name="download" size={15} color={colors.accent} />
                <Text style={styles.bulkDownloadLabel} numberOfLines={1}>
                  Module {si + 1} — {s.title}
                </Text>
                <Text style={styles.muted}>{plural(s.lessons.length, "lesson")}</Text>
                {c.isPremium && <Text style={styles.bestText}>FAST</Text>}
              </Press>
            </Link>
            {s.lessons.map((l) => (
              <Link key={l.id} href={`/courses/${c.slug}/lessons/${l.id}`} asChild>
                <Press
                  style={styles.lessonDownload}
                  onPress={() => setDownloadsOpen(false)}
                  accessibilityLabel={l.title}
                >
                  <Ionicons name="download-outline" size={15} color={colors.dim} />
                  <Text style={styles.lessonDownloadTitle} numberOfLines={1}>{l.title}</Text>
                  <Text style={styles.muted}>{formatDurationSec(l.durationSec)}</Text>
                  {c.isPremium && <Text style={styles.bestText}>FAST</Text>}
                </Press>
              </Link>
            ))}
          </View>
        ))}
      </Sheet>

      <AddToListSheet
        visible={listOpen}
        courseId={c.id}
        courseTitle={c.title}
        onClose={() => setListOpen(false)}
      />
    </ScrollView>
  );
}

/**
 * The author's controls on their own review or reply.
 *
 * Editing happens in place, where the text was, so the thread keeps its scroll
 * position while you fix a typo. Deleting asks first, inline — an OS Alert on top
 * of a screen you are already reading hides the thing you are deciding about, and
 * a review with replies under it is exactly the case where you need to see them.
 *
 * Held at muted grey until pressed: these belong to one reader on a page everyone
 * else can see, so they must not outshout Upvote.
 */
function ReviewOwnControls({
  row,
  small,
  onEdited,
  onDeleted,
}: {
  row: Review;
  small?: boolean;
  onEdited: (id: string, body: string, editedAt: string | null) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.body ?? "");
  const [confirming, setConfirming] = useState(false);

  const editMut = useMutation({
    mutationFn: (body: string) => api.editReview(row.id, body),
    onSuccess: (r) => {
      onEdited(row.id, r.body, r.editedAt);
      setEditing(false);
    },
  });
  const delMut = useMutation({
    mutationFn: () => api.deleteReview(row.id),
    onSuccess: () => onDeleted(row.id),
  });

  if (editing) {
    return (
      <View style={styles.ownEdit}>
        <TextInput
          style={styles.reviewInput}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          placeholder="Your review"
          placeholderTextColor={colors.dim}
        />
        <View style={styles.ownRow}>
          <Press
            style={styles.actionBtn}
            disabled={editMut.isPending || !draft.trim()}
            onPress={() => {
              const body = draft.trim();
              if (!body || body === row.body) {
                setDraft(row.body ?? "");
                setEditing(false);
                return;
              }
              editMut.mutate(body);
            }}
            accessibilityLabel="Save changes"
          >
            <Text style={styles.ownSave}>{editMut.isPending ? "Saving…" : "Save"}</Text>
          </Press>
          <Press
            style={styles.actionBtn}
            disabled={editMut.isPending}
            onPress={() => {
              setDraft(row.body ?? "");
              setEditing(false);
            }}
            accessibilityLabel="Cancel editing"
          >
            <Text style={styles.actionLabel}>Cancel</Text>
          </Press>
        </View>
        {editMut.isError && <Text style={styles.ownErr}>That did not save. Try again.</Text>}
      </View>
    );
  }

  if (confirming) {
    return (
      <View style={styles.ownRow}>
        <Text style={styles.ownAsk}>
          Delete this {small ? "reply" : "review"}
          {!small && row.replyCount > 0 ? ` and its ${plural(row.replyCount, "reply", "replies")}` : ""}?
        </Text>
        <Press
          style={styles.actionBtn}
          disabled={delMut.isPending}
          onPress={() => delMut.mutate()}
          accessibilityLabel="Confirm delete"
        >
          <Text style={styles.ownDanger}>{delMut.isPending ? "Deleting…" : "Delete"}</Text>
        </Press>
        <Press
          style={styles.actionBtn}
          disabled={delMut.isPending}
          onPress={() => setConfirming(false)}
          accessibilityLabel="Keep it"
        >
          <Text style={styles.actionLabel}>Keep</Text>
        </Press>
      </View>
    );
  }

  return (
    <View style={styles.ownRow}>
      <Press style={styles.actionBtn} onPress={() => setEditing(true)} accessibilityLabel="Edit your review">
        <Ionicons name="pencil-outline" size={13} color={colors.muted} />
        <Text style={styles.actionLabel}>Edit</Text>
      </Press>
      <Press style={styles.actionBtn} onPress={() => setConfirming(true)} accessibilityLabel="Delete your review">
        <Ionicons name="trash-outline" size={13} color={colors.muted} />
        <Text style={styles.actionLabel}>Delete</Text>
      </Press>
      {delMut.isError && <Text style={styles.ownErr}>Could not delete that.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  muted: { color: colors.muted, fontSize: 12 },
  /* The dead end when a course will not load: the shared Failed card, centred,
     plus one way out that is not the Back button. */
  dead: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", paddingHorizontal: 24 },
  ghostWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostWideLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  bannerWrap: { position: "relative" },
  banner: { width: "100%", backgroundColor: colors.surface },
  bannerFallback: { alignItems: "center", justifyContent: "center" },
  editCoverBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    backgroundColor: colors.scrim,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  editCoverLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  /* One primary-button shape for both sheets on this screen. */
  sheetPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
  },
  /* Press already dims a disabled control, so this only has to say which one it
     is — and the dark on-amber ink has to leave with the amber. */
  sheetPrimaryOff: { backgroundColor: colors.surfaceRaised },
  sheetPrimaryLabel: { color: colors.onAccent, fontSize: 14.5, fontWeight: "800" },
  sheetPrimaryLabelOff: { color: colors.dim },
  sheetNote: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sheetGroup: { marginTop: 14 },
  coverOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  coverOptionText: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.dim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  coverInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 46,
    paddingHorizontal: 15,
    fontSize: 13.5,
  },
  coverErr: { marginTop: 10 },
  // On a tablet a 900px-wide column of 14px prose is unreadable; cap it and
  // centre it the way the website does.
  body: { padding: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  // Same colour and size, no marginTop: inside a centred row that 4px pushed
  // the rating count below the stars it belongs to.
  metaInline: { color: colors.muted, fontSize: 13 },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  premiumText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: colors.muted, fontSize: 12 },
  desc: { color: colors.body, fontSize: 14, lineHeight: 20, marginTop: 14 },
  readMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: 38,
  },
  readMore: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" },
  /* "Start course" + "Download" + three 46px icon buttons is about 420px of
     controls. On a 360px phone the primary label was the thing that gave way,
     squeezed down to a couple of characters; now the icons wrap as a group. */
  ctaGroup: { flexDirection: "row", alignItems: "center", gap: 10, flexGrow: 1, flexBasis: 210 },
  iconGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  // These were Text styles: a text node cannot hold an icon beside a label, and
  // `paddingVertical` on one gave a 36px target where 44 is the floor.
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
  },
  primaryLabel: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
  },
  secondaryLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  iconBtn: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  // Filled + ringed, so saved reads as saved at a glance and not just as a
  // slightly different glyph.
  iconBtnOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  // A count needs room the 46px circle does not have. Widening rather than
  // shrinking the glyph keeps the tap target at 46 in both directions.
  iconBtnWide: { width: "auto", flexDirection: "row", gap: 5, paddingHorizontal: 14 },
  iconBtnCount: { color: colors.text, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  iconBtnCountOn: { color: colors.accent },
  downloadsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginTop: 16,
  },
  downloadsLabel: { color: colors.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8 },
  dlGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  dlCell: { flexGrow: 1, flexBasis: 64, gap: 1 },
  dlValue: { color: colors.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dlLabel: { color: colors.dim, fontSize: 10.5 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  lecturerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatar: { width: 24, height: 24, borderRadius: 12 },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: "700" },
  lecturerName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  section: { marginBottom: 10 },
  /* Every block on this page is separated by the same 22, and it was written as
     an inline object on the two that are not headed by `heading`. */
  section2: { marginTop: 22 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    paddingLeft: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lessonTitle: { color: colors.text, fontSize: 13, flex: 1, minWidth: 0 },
  ratingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  reviewAvg: { color: colors.text, fontSize: 32, fontWeight: "800" },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  distLabel: { flexDirection: "row", alignItems: "center", gap: 2, width: 22 },
  distNum: { color: colors.dim, fontSize: 10.5, fontVariant: ["tabular-nums"] },
  distTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  distFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  // Five bars with no numbers next to them are decoration; the count is the fact.
  distCount: { color: colors.dim, fontSize: 10, minWidth: 22, textAlign: "right" },
  notRated: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 6,
  },
  rateRowBare: { borderTopWidth: 0, paddingTop: 4 },
  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
  },
  signInText: { color: colors.accent, fontSize: 13, fontWeight: "700", flex: 1 },
  reviewForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  reviewInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: "top",
  },
  reviewFormRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  spoilerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  postBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
  },
  postLabel: { color: colors.onAccent, fontWeight: "800", fontSize: 12.5 },
  noReviews: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 4,
  },
  noReviewsText: { color: colors.muted, fontSize: 12.5, lineHeight: 18, flex: 1 },
  review: { marginBottom: 14 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewer: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  editorial: {
    backgroundColor: colors.accentSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editorialText: { color: colors.accent, fontSize: 9, fontWeight: "800" },
  reviewBody: { color: colors.body, fontSize: 13, marginTop: 4, marginBottom: 2 },
  reviewFooter: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 },
  /* Was `paddingVertical: 4` on a row of two 15px icons — about a 23px target
     for the only control a reader has on someone else's review. */
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 34, paddingRight: 4 },
  actionLabel: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
  upvoted: { color: colors.accent },
  replyRow: {
    marginTop: 8,
    marginLeft: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  replyAuthor: { color: colors.text, fontSize: 12, fontWeight: "700" },
  replyBody: { color: colors.body, fontSize: 12, marginTop: 2 },
  ownEdit: { marginTop: 8, gap: 2 },
  ownEdited: { color: colors.dim, fontSize: 10.5, fontStyle: "italic", marginTop: 2 },
  ownRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 6 },
  ownAsk: { color: colors.text, fontSize: 12 },
  ownSave: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  ownDanger: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  ownErr: { color: colors.danger, fontSize: 11.5, marginTop: 4 },
  downloadsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginTop: 22,
  },
  downloadsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  materialsNote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 4 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, minHeight: 38 },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: radius.sm,
    padding: 10,
    marginTop: 10,
    backgroundColor: colors.accentSoft,
  },
  bulkText: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1, minWidth: 0 },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 36,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  bulkBtnLabel: { color: colors.onAccent, fontSize: 11, fontWeight: "800" },
  /* Was `paddingHorizontal: 16` inside `body`, which already insets 16 — so the
     rail started 32px in and neither end could reach the edge of the column. */
  similarRow: { gap: 12, paddingTop: 8, paddingBottom: 2 },
  similarCard: { width: 132 },
  similarThumb: { width: 132, height: 176, borderRadius: radius.md, backgroundColor: colors.surface },
  similarFallback: { alignItems: "center", justifyContent: "center" },
  similarTitle: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  sheetGroupLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 2 },
  bulkDownload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.accentSoft,
  },
  bulkDownloadLabel: { color: colors.text, fontWeight: "700", fontSize: 13, flex: 1, minWidth: 0 },
  lessonDownload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
  },
  lessonDownloadTitle: { color: colors.text, fontSize: 13, flex: 1, minWidth: 0 },
  /* Was an inline {flex: 1} on the middle column of four different rows. */
  rowText: { flex: 1, minWidth: 0 },
  fileName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  fileMeta: { color: colors.dim, fontSize: 11, marginTop: 2 },
  // Files, grouped the way the bot delivers them: a module card holding its parts.
  fileModule: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginTop: 10,
  },
  fileModuleHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  fileModuleIndex: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  fileModuleTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  fileModuleMeta: { color: colors.dim, fontSize: 11, marginTop: 2 },
  filePartNum: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  ghostBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  ghostBtnLabel: { color: colors.text, fontSize: 11, fontWeight: "700" },
  // Was "⚡ Fast" — a badge, so give it a badge's shape.
  bestText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    backgroundColor: colors.accentSoft,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: "hidden",
  },
});
