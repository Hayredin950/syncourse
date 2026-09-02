import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { cloudinaryUrl } from "../../../lib/cloudinary";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as api from "../../../lib/api";
import { AddToListSheet } from "../../../components/AddToListSheet";
import { colors, radius } from "../../../lib/tokens";
import { formatDurationSec, type Category, type CourseDetail, type CourseSummary, type TelegramFile } from "../../../lib/types";
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
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => api.courseDetail(slug!),
  });

  const saveMut = useMutation({ mutationFn: () => api.toggleSave(slug!) });
  const likeMut = useMutation({ mutationFn: () => api.toggleLike(slug!) });
  const rateMut = useMutation({
    mutationFn: (stars: number) => api.rateCourse(slug!, stars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const reviewMut = useMutation({
    mutationFn: (body: { text: string; spoilers: boolean }) => api.postReview(slug!, body.text, body.spoilers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const upvoteMut = useMutation({
    mutationFn: (id: string) => api.toggleUpvote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course", slug] }),
  });
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

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
      if (c.lecturer?.slug) {
        const r2 = await api.browse({ lecturer: c.lecturer.slug, limit: 8 }).catch(() => ({ results: [] as CourseSummary[] }));
        const f2 = r2.results.filter((x) => x.id !== c.id);
        if (f2.length >= 4) return f2;
      }
      return filtered;
    },
    enabled: !!data,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
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
    },
    onError: (e: any) => Alert.alert("Upload failed", e?.message || "Try again"),
  });

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to pick a cover.");
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
    coverMut.mutate({ imageUrl: coverUrl.trim() });
  };

  // error before !data: on failure data is undefined, so checking !data first
  // made this branch unreachable and left a permanent spinner
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this course</Text>
      </View>
    );
  }
  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const c = data;
  const desc =
    c.description.length > 200 && !expanded
      ? `${c.description.slice(0, 200)}…`
      : c.description;
  // Most Syncourse courses are a Telegram archive with no lessons at all, so
  // the first openable lesson may live in any section — or nowhere.
  const firstLesson = c.sections.find((s) => s.lessons[0])?.lessons[0] ?? null;
  // A Telegram import creates one lesson-less Section per module just so the
  // course has some structure; rendering those gave "0 lessons · 0:00" rows that
  // only repeated the Course Materials list.
  const curriculum = c.sections.filter((s) => s.lessons.length > 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.bannerWrap}>
        <Image
          source={
            c.bannerUrl || c.thumbnailUrl
              ? { uri: cloudinaryUrl(c.bannerUrl || c.thumbnailUrl, { width: 840, height: 420 }) ?? undefined }
              : undefined
          }
          style={styles.banner}
          resizeMode="cover"
        />
        {!c.bannerUrl && !c.thumbnailUrl && (
          <View style={[styles.banner, styles.bannerFallback]}>
            <Text style={{ color: colors.dim, fontSize: 40 }}>▶</Text>
          </View>
        )}
        {me?.isStaff && (
          <Pressable style={styles.editCoverBtn} onPress={() => setCoverOpen(true)}>
            <Text style={styles.editCoverLabel}>
              {coverMut.isPending ? "Uploading…" : "✎ Edit cover"}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={coverOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCoverOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change course cover</Text>
            <Pressable style={styles.modalOption} onPress={pickFromGallery} disabled={coverMut.isPending}>
              <Text style={styles.modalOptionText}>📷 Choose from gallery</Text>
            </Pressable>
            <TextInput
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="…or paste an image URL"
              placeholderTextColor={colors.dim}
              style={styles.coverInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.modalOption, styles.modalPrimary, (!coverUrl.trim() || coverMut.isPending) && { opacity: 0.4 }]}
              disabled={!coverUrl.trim() || coverMut.isPending}
              onPress={uploadFromUrl}
            >
              <Text style={styles.modalPrimaryText}>Use this URL</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setCoverOpen(false)}>
              <Text style={styles.muted}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.body}>
        <Text style={styles.title}>{c.title}</Text>
        <View style={styles.metaRow}>
          {/* single-ZIP courses have no lessons and no ratings; printing the
              zeros made a complete course look empty (web guards these too) */}
          {c.ratingCount > 0 ? (
            <>
              <Stars value={c.ratingAvg} />
              <Text style={styles.metaText}> · {c.ratingCount} ratings</Text>
            </>
          ) : (
            <Text style={styles.metaText}>Not yet rated</Text>
          )}
          <View style={{ flex: 1 }} />
          {c.lessonCount > 0 && <Text style={styles.metaText}>{c.lessonCount} lessons</Text>}
        </View>
        <Text style={styles.metaText}>
          {c.level} · {c.language} · {c.downloadCount.toLocaleString()} downloads
        </Text>
        {c.isPremium && (
          <View style={styles.premiumBadge}>
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

        <Text style={styles.desc}>{desc}</Text>
        {c.description.length > 200 && (
          <Text style={styles.readMore} onPress={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Read more"}
          </Text>
        )}

        <View style={styles.actions}>
          {/* The archive *is* the course, so downloading is the primary action
              whenever there are no lessons to open in the app. */}
          {firstLesson ? (
            <>
              <Link href={`/courses/${c.slug}/lessons/${firstLesson.id}`} style={styles.primaryBtn}>
                Start course
              </Link>
              <Text style={styles.secondaryBtn} onPress={() => setDownloadsOpen(true)}>
                Download
              </Text>
            </>
          ) : (
            <Text style={styles.primaryBtn} onPress={() => setDownloadsOpen(true)}>
              Download
            </Text>
          )}
          <Text style={styles.iconBtn} onPress={() => saveMut.mutate()}>
            🔖
          </Text>
          <Text style={styles.iconBtn} onPress={() => likeMut.mutate()}>
            ❤️
          </Text>
          {/* Saving keeps a course to yourself; a list is how you group them and
              hand the group to someone else. */}
          <Text style={styles.iconBtn} onPress={() => setListOpen(true)}>
            🗂️
          </Text>
        </View>

        {c.downloads && (
          <View style={styles.downloadsCard}>
            <Text style={styles.downloadsLabel}>DOWNLOADS ON SYNCOURSE</Text>
            <Text style={styles.downloadsValue}>
              {c.downloads.total.toLocaleString()} total · {c.downloads.last30.toLocaleString()} last 30
              days · {c.downloads.last7.toLocaleString()} last 7 days · {c.downloads.today} today
            </Text>
          </View>
        )}

        {c.lecturer && (
          <>
            <Text style={styles.heading}>Lecturer</Text>
            <Pressable style={styles.lecturerRow} onPress={() => c.lecturer && router.push(`/lecturers/${c.lecturer.slug}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.lecturer.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lecturerName}>{c.lecturer.name}</Text>
                {(c.lecturer.credentials || c.lecturer.bio) && (
                  <Text style={styles.muted} numberOfLines={2}>
                    {[c.lecturer.credentials, c.lecturer.bio].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
              <Text style={{ color: colors.dim }}>›</Text>
            </Pressable>
          </>
        )}

        {c.organization && (
          <>
            <Text style={styles.heading}>Organization</Text>
            <Pressable style={styles.lecturerRow} onPress={() => c.organization && router.push(`/organizations/${c.organization.slug}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.organization.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lecturerName}>{c.organization.name}</Text>
                <Text style={styles.muted}>See all courses</Text>
              </View>
              <Text style={{ color: colors.dim }}>›</Text>
            </Pressable>
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
                    · {section.lessons.length} lesson{section.lessons.length === 1 ? "" : "s"} · {formatDurationSec(section.lessons.reduce((s, l) => s + l.durationSec, 0))}
                  </Text>
                </Text>
                {section.lessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    href={`/courses/${c.slug}/lessons/${lesson.id}`}
                    style={styles.lessonRow}
                  >
                    <Text style={{ color: colors.dim }}>{lesson.type === "video" ? "▶" : "📄"}</Text>
                    <Text style={styles.lessonTitle} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                    <Text style={styles.muted}>{formatDurationSec(lesson.durationSec)}</Text>
                  </Link>
                ))}
              </View>
            ))}
          </>
        )}

        <Text style={styles.heading}>How it&apos;s rated</Text>
        <View style={styles.ratingCard}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewAvg}>{c.ratings.avg.toFixed(1)}</Text>
            <View style={{ flex: 1 }}>
              <StarRow value={c.ratings.avg} size={14} />
              <Text style={styles.muted}>{c.ratings.count} community ratings</Text>
            </View>
          </View>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = c.ratings.distribution[n] ?? 0;
            const max = Math.max(1, ...Object.values(c.ratings.distribution));
            return (
              <View key={n} style={styles.distRow}>
                <Text style={styles.distLabel}>{n}★</Text>
                <View style={styles.distTrack}>
                  <View style={[styles.distFill, { width: `${(count / max) * 100}%` }]} />
                </View>
              </View>
            );
          })}
          <View style={styles.rateRow}>
            <Text style={styles.muted}>Rate this course</Text>
            <StarPicker value={myRating} onChange={(s) => rateMut.mutate(s)} />
          </View>
        </View>

        <Text style={styles.heading}>Reviews · {c.reviews.length}</Text>
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
              <Switch value={spoilers} onValueChange={setSpoilers} trackColor={{ true: colors.accent }} />
            </View>
            <Pressable
              style={[styles.postBtn, !reviewText.trim() && { opacity: 0.4 }]}
              disabled={!reviewText.trim() || reviewMut.isPending}
              onPress={() => reviewMut.mutate({ text: reviewText, spoilers })}
            >
              <Text style={styles.postLabel}>{reviewMut.isPending ? "…" : "Post review"}</Text>
            </Pressable>
          </View>
        </View>
        {c.reviews.length === 0 && (
          <Text style={styles.muted}>No reviews yet — be the first to rate this course</Text>
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
            <View style={styles.reviewFooter}>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  if (!me) {
                    router.push("/auth");
                    return;
                  }
                  upvoteMut.mutate(r.id);
                }}
              >
                <Text style={[styles.actionIcon, r.upvoted && styles.upvoted]}>▲</Text>
                <Text style={[styles.actionLabel, r.upvoted && styles.upvoted]}>{r.upvotes ?? 0}</Text>
              </Pressable>
              <Text style={styles.muted}>{r.replyCount} repl{r.replyCount === 1 ? "y" : "ies"}</Text>
            </View>
            {/* the API nests reply bodies under each review — render them instead
                of only a counter the reader can never open */}
            {(r.replies ?? []).map((rep) => (
              <View key={rep.id} style={styles.replyRow}>
                <Text style={styles.replyAuthor}>
                  {rep.userName}
                  {rep.isStaff ? " · staff" : ""}
                </Text>
                {rep.body && <Text style={styles.replyBody}>{rep.body}</Text>}
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
            <Pressable onPress={() => setDownloadsOpen(true)}>
              <Text style={styles.seeAll}>All lessons ⬇</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>
            Grab a whole module at once or pick individual lessons. Premium gets full-speed delivery.
          </Text>
          {curriculum.slice(0, 3).map((s, si) => (
            <View key={s.id} style={styles.bulkRow}>
              <Text style={styles.bulkText} numberOfLines={1}>
                Module {si + 1} — {s.title}
              </Text>
              <Text style={styles.muted}>{s.lessons.length} lessons</Text>
              {/* `?bulk=1` was read by nothing and an empty lessons[0] navigated
                  to /lessons/ with a blank id, which hung on a spinner */}
              {s.lessons[0] && (
                <Link href={`/courses/${c.slug}/lessons/${s.lessons[0].id}`} style={styles.bulkBtn}>
                  <Text style={styles.bulkBtnLabel}>Open</Text>
                </Link>
              )}
            </View>
          ))}
        </View>
        )}

        {/* Telegram files — the actual course materials linked via the bot */}
        {c.telegramFiles && c.telegramFiles.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <View style={styles.downloadsHead}>
              <Text style={styles.heading}>Course Materials</Text>
              <Pressable style={styles.bulkBtn} onPress={() => Linking.openURL(botLink(`dl_${c.slug}`))}>
                <Text style={styles.bulkBtnLabel}>⬇ Download all</Text>
              </Pressable>
            </View>
            <Text style={styles.materialsNote}>
              Tap a part and the bot sends only that file. “Download all” asks it for everything.
            </Text>
            {fileModules.map((m, mi) => (
              <View key={m.key} style={styles.fileModule}>
                <View style={styles.fileModuleHead}>
                  <Text style={styles.fileModuleIndex}>{String(mi + 1).padStart(2, "0")}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileModuleTitle} numberOfLines={2}>
                      {m.title ?? "Course archive"}
                    </Text>
                    <Text style={styles.fileModuleMeta}>
                      {m.files.length} part{m.files.length === 1 ? "" : "s"}
                      {m.sizeMb > 0 ? ` · ${Math.round(m.sizeMb)} MB` : ""}
                    </Text>
                  </View>
                  {/* One tap for the whole module — addressed through any part it
                      holds, since the bot resolves the module from the link id. */}
                  {m.files.length > 1 && (
                    <Pressable
                      style={styles.ghostBtn}
                      onPress={() => Linking.openURL(botLink(`dlmod_${m.files[0].id}`))}
                    >
                      <Text style={styles.ghostBtnLabel}>All parts</Text>
                    </Pressable>
                  )}
                </View>
                {m.files.map((file) => (
                  <View key={file.id} style={styles.lessonDownload}>
                    <Text style={styles.filePartNum}>{String(file.partIndex).padStart(2, "0")}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }} numberOfLines={2}>
                        {file.fileName || `Part ${file.partIndex}`}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.dim, marginTop: 2 }}>
                        {file.fileSizeMb ? `${file.fileSizeMb} MB` : "Telegram attachment"}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.bulkBtn}
                      onPress={() => {
                        // One part per button: the bot delivers this attachment alone,
                        // so nobody pulls 300 MB to re-fetch the one part that failed.
                        Linking.openURL(botLink(`dlf_${file.id}`));
                      }}
                    >
                      <Text style={styles.bulkBtnLabel}>⬇ Part {file.partIndex}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* More like this (phonofilm: 12-item related rail) */}
        {similarQ.data && similarQ.data.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <View style={styles.downloadsHead}>
              <Text style={styles.heading}>More like this</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarRow}>
              {similarQ.data.map((sc) => (
                <Pressable key={sc.id} style={{ width: 132 }} onPress={() => router.push(`/courses/${sc.slug}`)}>
                  {sc.thumbnailUrl ? (
                    <Image source={{ uri: cloudinaryUrl(sc.thumbnailUrl, { width: 264, height: 300 }) ?? undefined }} style={styles.similarThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.similarThumb, styles.similarFallback]}>
                      <Text style={{ color: colors.dim }}>▶</Text>
                    </View>
                  )}
                  <Text numberOfLines={2} style={styles.similarTitle}>{sc.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* downloads sheet */}
      <Modal visible={downloadsOpen} transparent animationType="slide" onRequestClose={() => setDownloadsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDownloadsOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Available downloads</Text>
              <Pressable onPress={() => setDownloadsOpen(false)}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: "80%" }}>
              <Text style={styles.muted}>
                Lesson files are served through short-lived signed links. Premium members get full-speed delivery.
              </Text>
              <Pressable
                style={styles.telegramRow}
                onPress={() => Linking.openURL(botLink(`dl_${c.slug}`))}
              >
                <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 15 }}>✈</Text>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, flex: 1 }} numberOfLines={1}>
                  Get this course via Telegram
                </Text>
                <Text style={styles.muted}>sent to your chat</Text>
              </Pressable>

              {/* Telegram-linked files */}
              {c.telegramFiles && c.telegramFiles.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginBottom: 6 }}>LINKED FROM TELEGRAM</Text>
                  {c.telegramFiles.map((f) => (
                    <Pressable
                      key={f.id}
                      style={styles.lessonDownload}
                      onPress={() => Linking.openURL(botLink(`dlf_${f.id}`))}
                    >
                      <Text style={{ color: colors.dim }}>⬇</Text>
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={2}>
                        {f.moduleTitle ? `${f.moduleTitle} · Part ${f.partIndex}` : `Part ${f.partIndex}`}
                        {f.fileName && <Text style={{ color: colors.muted, fontSize: 10 }}> {f.fileName}</Text>}
                        {f.fileSizeMb && <Text style={{ color: colors.muted, fontSize: 10 }}>{f.fileSizeMb} MB</Text>}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {curriculum.map((s, si) => (
                <View key={s.id} style={{ marginTop: 14 }}>
                  <Pressable
                    style={styles.bulkDownload}
                    onPress={() => {
                      setDownloadsOpen(false);
                    }}
                  >
                    <Link
                      href={s.lessons[0] ? `/courses/${c.slug}/lessons/${s.lessons[0].id}` : `/courses/${c.slug}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                    >
                      <Text style={{ color: colors.accent, fontWeight: "800" }}>⬇</Text>
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, flex: 1 }} numberOfLines={1}>
                        Module {si + 1} — {s.title}
                      </Text>
                      <Text style={styles.muted}>{s.lessons.length} lessons</Text>
                      <Text style={styles.bestText}>⚡ Fast</Text>
                    </Link>
                  </Pressable>
                  {s.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/courses/${c.slug}/lessons/${l.id}`}
                      style={styles.lessonDownload}
                    >
                      <Text style={{ color: colors.dim }}>⬇</Text>
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{l.title}</Text>
                      <Text style={styles.muted}>{formatDurationSec(l.durationSec)}</Text>
                      {c.isPremium && <Text style={styles.bestText}>⚡ Fast</Text>}
                    </Link>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <AddToListSheet
        visible={listOpen}
        courseId={c.id}
        courseTitle={c.title}
        onClose={() => setListOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  bannerWrap: { position: "relative" },
  banner: { width: "100%", height: 210, backgroundColor: colors.surface },
  bannerFallback: { alignItems: "center", justifyContent: "center" },
  editCoverBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editCoverLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 14 },
  modalOption: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  modalOptionText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  modalPrimary: { backgroundColor: colors.accent },
  modalPrimaryText: { color: "#000", fontSize: 14, fontWeight: "800" },
  coverInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 13,
    marginBottom: 10,
  },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
  body: { padding: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  metaText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  premiumBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
  },
  premiumText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: colors.muted, fontSize: 12 },
  desc: { color: "rgba(244,244,245,0.7)", fontSize: 14, lineHeight: 20, marginTop: 14 },
  readMore: { color: colors.accent, fontSize: 13, fontWeight: "600", marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
    borderRadius: 999,
    paddingVertical: 13,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  iconBtn: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  downloadsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  downloadsLabel: { color: colors.dim, fontSize: 11, fontWeight: "700" },
  downloadsValue: { color: "rgba(244,244,245,0.7)", fontSize: 12, marginTop: 4 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  lecturerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
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
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lessonTitle: { color: colors.text, fontSize: 13, flex: 1 },
  ratingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  reviewAvg: { color: colors.text, fontSize: 32, fontWeight: "800" },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  distLabel: { color: colors.dim, fontSize: 10, width: 18 },
  distTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  distFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 6,
  },
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
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  postLabel: { color: "#000", fontWeight: "800", fontSize: 12 },
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
  reviewBody: { color: "rgba(244,244,245,0.7)", fontSize: 13, marginTop: 4, marginBottom: 2 },
  reviewFooter: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionIcon: { color: colors.muted, fontSize: 11 },
  actionLabel: { color: colors.muted, fontSize: 12 },
  upvoted: { color: colors.accent },
  replyRow: {
    marginTop: 8,
    marginLeft: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(244,244,245,0.14)",
  },
  replyAuthor: { color: colors.text, fontSize: 12, fontWeight: "700" },
  replyBody: { color: "rgba(244,244,245,0.7)", fontSize: 12, marginTop: 2 },
  downloadsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 22,
  },
  downloadsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  materialsNote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 4 },
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
  bulkText: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 },
  bulkBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bulkBtnLabel: { color: "#000", fontSize: 11, fontWeight: "800" },
  similarRow: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
  similarThumb: { width: 132, height: 150, borderRadius: radius.md, backgroundColor: colors.surface },
  similarFallback: { alignItems: "center", justifyContent: "center" },
  similarTitle: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  done: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  bulkDownload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.accentSoft,
  },
  telegramRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    padding: 12,
    marginTop: 12,
    backgroundColor: colors.accentSoft,
  },
  lessonDownload: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 11,
    marginTop: 8,
  },
  // Files, grouped the way the bot delivers them: a module card holding its parts.
  fileModule: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ghostBtnLabel: { color: colors.text, fontSize: 11, fontWeight: "700" },
  bestText: { color: colors.accent, fontSize: 9, fontWeight: "800" },
});
