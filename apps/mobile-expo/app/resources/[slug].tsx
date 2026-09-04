import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useEvent } from "expo";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, RefreshControl, ScrollView, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { Sk, SkText } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import { Markdown } from "../../components/Markdown";
import {
  compact,
  mediaLine,
  mediaMeta,
  ResourceCard,
  resourceTint,
  typeMeta,
} from "../../components/ResourceCard";
import * as api from "../../lib/api";
import { attachmentUrl, cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { mediaTitle, plural, type ResourceMedia } from "../../lib/types";

/**
 * A resource, shown whole.
 *
 * Unlike a course — which lives in Telegram and is only linked from here — a
 * resource carries its body with the row and its media on Cloudinary, so this
 * screen leads with the artefact itself: pictures at full size, video played
 * inline, the text rendered, and only then the files to keep.
 */

/** Kinds with no viewer above the files panel, so the panel is their only home. */
const PLAIN_KINDS = ["doc", "sheet", "slide", "archive", "code", "other"];

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "docs.expo.dev" — a link's own name when nobody gave it one. */
function hostOf(url: string | null): string {
  if (!url) return "Link";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export default function ResourceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));
  const scrollRef = useRef<ScrollView>(null);
  const filesY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shot, setShot] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [audioId, setAudioId] = useState<string | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const { data: r, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["resource", slug],
    queryFn: () => api.resourceDetail(slug!),
    enabled: !!slug,
  });

  // One player for every audio track on the page: swapping its source is what
  // makes starting a second clip stop the first, with no cross-row bookkeeping.
  // expo-video plays audio-only sources fine without a mounted VideoView.
  const audio = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(audio, "playingChange", { isPlaying: audio.playing });

  const media = useMemo(() => r?.media ?? [], [r]);
  const images = useMemo(() => media.filter((m) => m.kind === "image" && m.url), [media]);
  const videos = useMemo(() => media.filter((m) => m.kind === "video" && m.url), [media]);
  const tracks = useMemo(() => media.filter((m) => m.kind === "audio" && m.url), [media]);
  const pdfs = useMemo(() => media.filter((m) => m.kind === "pdf" && m.url), [media]);
  const links = useMemo(() => media.filter((m) => m.kind === "link" && m.url), [media]);
  // Files with no viewer above come first: the panel is the only place they
  // appear, where an image or a PDF has already been shown in full.
  const keepable = useMemo(() => {
    const items = media.filter((m) => m.kind !== "link" && m.url);
    return [
      ...items.filter((m) => PLAIN_KINDS.includes(m.kind)),
      ...items.filter((m) => !PLAIN_KINDS.includes(m.kind)),
    ];
  }, [media]);

  const flash = useCallback((message: string) => {
    setToast(message);
    // Held in a ref so a second download doesn't have the first one's timer
    // clear its toast a moment after it appears.
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Fire-and-forget: a failed counter must never stand between you and a file.
  const countDownload = useCallback(() => {
    if (slug) void api.countResourceDownload(slug).catch(() => undefined);
  }, [slug]);

  const save = useCallback(
    (item: ResourceMedia) => {
      const url = attachmentUrl(item.url);
      if (!url) return;
      countDownload();
      flash(`Saving ${mediaTitle(item, "file")}…`);
      void Linking.openURL(url);
    },
    [countDownload, flash],
  );

  const openExternally = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.bg,
      controlsColor: colors.accent,
      enableBarCollapsing: true,
      dismissButtonStyle: "close",
    });
  }, []);

  const share = useCallback(() => {
    if (!r) return;
    // Android's share sheet ignores `url`, so the link has to ride in `message`.
    const link = `${api.WEB_URL}/resources/${r.slug}`;
    void Share.share({ message: `${r.title} — ${link}`, url: link, title: r.title });
  }, [r]);

  const playTrack = useCallback(
    (item: ResourceMedia) => {
      if (!item.url) return;
      if (audioId === item.id) {
        if (isPlaying) audio.pause();
        else audio.play();
        return;
      }
      setAudioId(item.id);
      void audio.replaceAsync(item.url).then(() => audio.play());
    },
    [audio, audioId, isPlaying],
  );

  const toFiles = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(filesY.current - 12, 0), animated: true });
  }, []);

  // `error` is checked before `!r`: on failure the data is always undefined, so
  // the other order leaves a permanent spinner on a dead slug.
  if (error) {
    return (
      <View style={styles.dead}>
        <Failed
          title="This resource would not open"
          body={
            (error as api.ApiError | null)?.status === 404
              ? "It may have been unpublished since you last saw it."
              : "Check your connection and try again."
          }
          onRetry={() => refetch()}
        />
        {/* `replace`, not `push`: going Back to a resource that failed to load is
            a dead end, so this screen gives up its place in the stack. */}
        <Press
          style={styles.ghostBtn}
          onPress={() => router.replace("/browse?tab=resources" as never)}
          accessibilityLabel="Go to all resources"
        >
          <Ionicons name="albums-outline" size={14} color={colors.text} />
          <Text style={styles.ghostLabel}>All resources</Text>
        </Press>
      </View>
    );
  }
  if (isLoading || !r) {
    /* Was a centred spinner on an empty screen. This holds the page's own shape —
       hero, meta line, action row, body — so nothing jumps when the data lands. */
    return (
      <View style={[styles.screen, { paddingHorizontal: gutter, paddingTop: 16 }]}>
        <Sk style={styles.heroSk} />
        <Sk style={styles.lineSk} />
        <View style={styles.actionsSk}>
          <Sk style={styles.btnSk} />
          <Sk style={styles.iconSk} />
        </View>
        <SkText lines={7} />
      </View>
    );
  }

  const meta = typeMeta(r.type);
  const tint = resourceTint(r.slug || r.id);
  const facts: [string, string][] = [
    ["Type", meta.label],
    ...(r.category ? ([["Category", r.category.name]] as [string, string][]) : []),
    ...(r.organization ? ([["Publisher", r.organization.name]] as [string, string][]) : []),
    ...(r.lecturer ? ([["Author", r.lecturer.name]] as [string, string][]) : []),
    ["Published", stamp(r.publishedAt)],
    ...(r.updatedAt && r.updatedAt !== r.publishedAt
      ? ([["Last edited", stamp(r.updatedAt)]] as [string, string][])
      : []),
    ...(r.readMinutes > 0 ? ([["Read time", `${r.readMinutes} min`]] as [string, string][]) : []),
    ["Attachments", mediaLine(r.mediaKinds, r.mediaCount)],
    ["Views", compact(r.viewCount)],
    ["Downloads", compact(r.downloadCount)],
  ];
  const hasBody = !!r.bodyMd && !!r.bodyMd.trim();

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
        }
      >
        {/* hero */}
        <View style={styles.hero}>
          {r.coverUrl ? (
            <Image
              source={{ uri: cloudinaryUrl(r.coverUrl, { width: 900, height: 560 }) ?? undefined }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.base }]}>
              <View style={[styles.heroBlob, { backgroundColor: tint.blob }]} />
            </View>
          )}
          <View style={styles.heroWash} />
          <View style={styles.heroInner}>
            <View style={styles.kicker}>
              <Ionicons name={meta.icon} size={12} color={colors.accent} />
              <Text style={styles.kickerText}>{meta.label.toUpperCase()}</Text>
              {!!r.category && (
                <Press
                  hitSlop={10}
                  onPress={() => router.push(`/resources?category=${r.category!.slug}` as never)}
                  accessibilityLabel={`See every resource in ${r.category.name}`}
                >
                  <Text style={styles.kickerLink}>· {r.category.name}</Text>
                </Press>
              )}
              {r.isPremium && <Text style={styles.kickerBadge}>PREMIUM</Text>}
            </View>
            <Text style={styles.heroTitle}>{r.title}</Text>
            {!!r.summary && (
              <Text style={styles.heroLede} numberOfLines={3}>
                {r.summary}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.metaRow}>
          {[
            stamp(r.publishedAt),
            r.readMinutes > 0 ? `${r.readMinutes} min read` : "",
            `${compact(r.viewCount)} views`,
            `${compact(r.downloadCount)} downloads`,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>

        <View style={styles.actions}>
          {keepable.length > 0 && (
            <Press
              style={styles.primaryBtn}
              onPress={toFiles}
              haptic
              accessibilityLabel={`Jump to the ${plural(keepable.length, "file")} attached to this resource`}
            >
              <Ionicons name="download-outline" size={14} color={colors.onAccent} />
              <Text style={styles.primaryLabel}>Get the files ({keepable.length})</Text>
            </Press>
          )}
          {!!r.sourceUrl && (
            <Press
              style={styles.ghostBtn}
              onPress={() => openExternally(r.sourceUrl!)}
              accessibilityLabel="Open the original, outside the app"
            >
              <Ionicons name="open-outline" size={14} color={colors.text} />
              <Text style={styles.ghostLabel}>Original</Text>
            </Press>
          )}
          <Press style={styles.iconBtn} onPress={share} accessibilityLabel="Share this resource">
            <Ionicons name="share-social-outline" size={16} color={colors.text} />
          </Press>
        </View>

        {!hasBody && media.length === 0 && (
          <View style={styles.panel}>
            <Text style={styles.muted}>
              This one is still being written — nothing has been attached to it yet.
            </Text>
          </View>
        )}

        {/* gallery — two per row, full width when there is only one */}
        {images.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Gallery</Text>
            <View style={styles.gallery}>
              {images.map((m, i) => {
                const label = mediaTitle(m, `Sheet ${i + 1}`);
                return (
                  <Press
                    key={m.id}
                    style={[styles.shot, images.length === 1 && styles.shotWide]}
                    onPress={() => setShot(i)}
                    accessibilityLabel={`View ${label} full size`}
                  >
                    <Image
                      source={{ uri: cloudinaryUrl(m.url, { width: 800 }) ?? undefined }}
                      style={styles.shotImg}
                      resizeMode="cover"
                    />
                    <View style={styles.shotZoom}>
                      <Ionicons name="expand-outline" size={12} color={colors.text} />
                    </View>
                    {!!m.caption && (
                      <Text numberOfLines={1} style={styles.shotCap}>
                        {m.caption}
                      </Text>
                    )}
                  </Press>
                );
              })}
            </View>
          </View>
        )}

        {videos.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Watch</Text>
            {videos.map((m) => (
              <ResourceVideo key={m.id} item={m} />
            ))}
          </View>
        )}

        {tracks.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Listen</Text>
            {tracks.map((m) => {
              const active = audioId === m.id;
              const name = mediaTitle(m, "Audio");
              return (
                <View key={m.id} style={styles.audioRow}>
                  <Press
                    style={styles.playBtn}
                    onPress={() => playTrack(m)}
                    haptic
                    accessibilityLabel={`${active && isPlaying ? "Pause" : "Play"} ${name}`}
                  >
                    <Ionicons
                      name={active && isPlaying ? "pause" : "play"}
                      size={15}
                      color={colors.accent}
                    />
                  </Press>
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {name}
                    </Text>
                    <Text style={styles.rowSub}>
                      {active ? (isPlaying ? "Playing" : "Paused") : "Audio"}
                      {m.fileSizeMb ? ` · ${m.fileSizeMb} MB` : ""}
                    </Text>
                  </View>
                  <Press
                    style={styles.rowBtn}
                    onPress={() => save(m)}
                    accessibilityLabel={`Save ${name}`}
                  >
                    <Ionicons name="download-outline" size={14} color={colors.text} />
                  </Press>
                </View>
              );
            })}
          </View>
        )}

        {hasBody && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Read</Text>
            <Markdown text={r.bodyMd} />
          </View>
        )}

        {/* PDFs. Expo SDK 57 ships no first-party PDF or WebView module and this
            app pulls in no third-party viewer, so the honest thing is a system
            browser tab plus a real save — not a blank embedded frame. */}
        {pdfs.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Documents</Text>
            <Text style={styles.blockHint}>PDFs open in your browser. Save keeps a copy.</Text>
            {pdfs.map((m) => {
              const name = mediaTitle(m, "Document");
              return (
                <View key={m.id} style={styles.fileRow}>
                  <Ionicons name="document-outline" size={16} color={colors.accent} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {name}
                    </Text>
                    <Text style={styles.rowSub}>PDF{m.fileSizeMb ? ` · ${m.fileSizeMb} MB` : ""}</Text>
                  </View>
                  <Press
                    style={styles.rowBtn}
                    onPress={() => openExternally(m.url!)}
                    accessibilityLabel={`Open ${name} in your browser`}
                  >
                    <Text style={styles.rowBtnLabel}>Open</Text>
                  </Press>
                  <Press
                    style={styles.rowBtn}
                    onPress={() => save(m)}
                    accessibilityLabel={`Save ${name}`}
                  >
                    <Ionicons name="download-outline" size={14} color={colors.text} />
                  </Press>
                </View>
              );
            })}
          </View>
        )}

        {keepable.length > 0 && (
          <View
            style={styles.block}
            onLayout={(e) => {
              filesY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.blockHead}>Files ({keepable.length})</Text>
            <Text style={styles.blockHint}>
              Everything attached to this resource, straight from storage — no bot, no queue.
            </Text>
            {keepable.map((m) => {
              const km = mediaMeta(m.kind);
              const name = mediaTitle(m, km.label);
              return (
                <Press
                  key={m.id}
                  style={styles.fileRow}
                  onPress={() => save(m)}
                  accessibilityLabel={`Save ${name}, ${km.label}${m.fileSizeMb ? `, ${m.fileSizeMb} megabytes` : ""}`}
                >
                  <Ionicons name={km.icon} size={16} color={colors.accent} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {name}
                    </Text>
                    <Text style={styles.rowSub}>
                      {km.label}
                      {m.fileSizeMb ? ` · ${m.fileSizeMb} MB` : ""}
                    </Text>
                  </View>
                  <Ionicons name="download-outline" size={16} color={colors.muted} />
                </Press>
              );
            })}
          </View>
        )}

        {links.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>Links</Text>
            {links.map((m) => {
              // A link's natural name is where it goes. Falling back to the host
              // beats printing a storage key, and beats printing the whole URL
              // twice when the row already shows it underneath.
              const name = mediaTitle(m, hostOf(m.url) || "Link");
              return (
                <Press
                  key={m.id}
                  style={styles.fileRow}
                  onPress={() => openExternally(m.url!)}
                  accessibilityLabel={`Open ${name}, outside the app`}
                >
                  <Ionicons name="link-outline" size={16} color={colors.accent} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={styles.rowSub}>
                      {m.url}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={15} color={colors.muted} />
                </Press>
              );
            })}
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.blockHead}>Details</Text>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.factRow}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {r.tags.length > 0 && (
          <View style={styles.tags}>
            {r.tags.map((t) => (
              <Press
                key={t}
                style={styles.tag}
                onPress={() => router.push(`/resources?tag=${encodeURIComponent(t)}` as never)}
                accessibilityLabel={`See everything tagged ${t}`}
              >
                <Text style={styles.tagText}>#{t}</Text>
              </Press>
            ))}
          </View>
        )}

        {r.related.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockHead}>More like this</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedRow}
            >
              {r.related.map((x) => (
                <ResourceCard key={x.id} resource={x} width={244} />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Was pinned 26px off the raw bottom edge, which on a phone with a gesture
          bar puts it under the bar. */}
      {!!toast && (
        <View
          style={[styles.toast, { bottom: Math.max(20, insets.bottom + 14) }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Lightbox
        images={images}
        index={shot}
        onClose={() => setShot(null)}
        onSave={save}
      />
    </View>
  );
}

/**
 * One player per video component, so the hook count never depends on how many
 * clips a resource happens to carry. Controls only — autoplay on a reference
 * page is hostile.
 */
function ResourceVideo({ item }: { item: ResourceMedia }) {
  const player = useVideoPlayer(item.url ?? "", (p) => {
    p.loop = false;
  });
  // A Cloudinary public id is not a title. Falls through to the caption, then to
  // the generic noun, so the caption under the player never reads
  // "hsjghfs0im0k6l1p2fzj.mp4".
  const label = mediaTitle(item, "");
  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
      {!!label && (
        <Text numberOfLines={1} style={styles.cap}>
          {label}
        </Text>
      )}
    </View>
  );
}

/**
 * Full-bleed image pager. The initial page is set with `scrollTo` once the
 * content is measured rather than with `contentOffset`, which Android honours
 * inconsistently on first layout.
 */
function Lightbox({
  images,
  index,
  onClose,
  onSave,
}: {
  images: ResourceMedia[];
  index: number | null;
  onClose: () => void;
  onSave: (item: ResourceMedia) => void;
}) {
  const width = useWindowDimensions().width;
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(index ?? 0);
  const open = index !== null;
  const current = images[page];

  // The modal stays mounted, so the opening index has to be pushed in on every
  // change — a `useState` initialiser only ever runs for the first tap.
  useEffect(() => {
    if (index === null) return;
    setPage(index);
    const t = setTimeout(() => pager.current?.scrollTo({ x: index * width, animated: false }), 0);
    return () => clearTimeout(t);
  }, [index, width]);

  return (
    <Modal
      visible={open}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.lightbox} accessibilityViewIsModal>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (open) pager.current?.scrollTo({ x: (index ?? 0) * width, animated: false });
          }}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
          }
        >
          {images.map((m) => (
            <Image
              key={m.id}
              source={{ uri: m.url ?? undefined }}
              style={{ width, height: "100%" }}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
        {/* Was fixed at top: 44 — under the camera cutout on a tall phone and
            floating in the middle of the bezel on a short one. */}
        <Press
          style={[styles.lbClose, { top: insets.top + 12, right: Math.max(16, insets.right + 12) }]}
          onPress={onClose}
          accessibilityLabel="Close the image viewer"
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Press>
        <View
          style={[
            styles.lbFoot,
            {
              bottom: Math.max(24, insets.bottom + 16),
              left: Math.max(16, insets.left + 12),
              right: Math.max(16, insets.right + 12),
            },
          ]}
        >
          <Text numberOfLines={1} style={styles.lbCap}>
            {current ? mediaTitle(current, `${page + 1} of ${images.length}`) : ""}
          </Text>
          {!!current && (
            <Press
              style={styles.rowBtn}
              onPress={() => onSave(current)}
              accessibilityLabel={`Save ${mediaTitle(current, "this image")}`}
            >
              <Ionicons name="download-outline" size={14} color={colors.text} />
              <Text style={styles.rowBtnLabel}>Save</Text>
            </Press>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 48, gap: 14 },
  dead: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 24,
  },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },

  heroSk: { height: 208, borderRadius: radius.lg },
  lineSk: { width: "58%", height: 11, marginTop: 14 },
  actionsSk: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  btnSk: { flex: 1, height: 44, borderRadius: radius.pill },
  iconSk: { width: 44, height: 44, borderRadius: radius.pill },

  hero: {
    height: 208,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: colors.surface,
  },
  heroBlob: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -110,
    right: -80,
    opacity: 0.5,
  },
  heroWash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(14,13,11,0.62)",
  },
  heroInner: { padding: 14, gap: 6 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  kickerText: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  kickerLink: { color: colors.text, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  kickerBadge: {
    color: colors.onAccent,
    backgroundColor: colors.accent,
    fontSize: 9,
    fontWeight: "800",
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },
  heroTitle: { color: colors.text, fontSize: 23, fontWeight: "800", lineHeight: 28, letterSpacing: -0.4 },
  heroLede: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  metaRow: { color: colors.dim, fontSize: 11, fontVariant: ["tabular-nums"] },

  /* Wraps: on a 360px phone "Get the files (7)" plus "Original" plus the share
     button does not fit on one line, and the share button was being squeezed
     down to a sliver rather than moving. */
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
  },
  ghostLabel: { color: colors.text, fontSize: 12, fontWeight: "700" },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    marginLeft: "auto",
  },

  block: { gap: 8 },
  blockHead: { color: colors.text, fontSize: 15, fontWeight: "800" },
  blockHint: { color: colors.dim, fontSize: 11, lineHeight: 16 },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    gap: 8,
  },

  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shot: {
    width: "48.5%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shotWide: { width: "100%" },
  shotImg: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.surfaceRaised },
  shotZoom: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "rgba(14,13,11,0.75)",
    borderRadius: radius.pill,
    padding: 5,
  },
  shotCap: { color: colors.dim, fontSize: 10, paddingHorizontal: 8, paddingVertical: 6 },

  videoWrap: { gap: 5 },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: "#000",
  },
  cap: { color: colors.dim, fontSize: 11 },

  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },

  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  /* Was an inline {flex: 1} on the middle column of four different rows. */
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  rowSub: { color: colors.dim, fontSize: 11, marginTop: 1 },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 38,
    minWidth: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
  },
  rowBtnLabel: { color: colors.text, fontSize: 11, fontWeight: "700" },

  factRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  factLabel: { color: colors.dim, fontSize: 11, width: 96 },
  factValue: { color: colors.text, fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    justifyContent: "center",
    minHeight: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  tagText: { color: colors.muted, fontSize: 11 },
  relatedRow: { gap: 10, paddingRight: 4 },

  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  toastText: { color: colors.text, fontSize: 12, textAlign: "center" },

  lightbox: { flex: 1, backgroundColor: "#000" },
  lbClose: {
    position: "absolute",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,21,18,0.9)",
    borderRadius: radius.pill,
  },
  lbFoot: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lbCap: { color: colors.muted, fontSize: 12, flex: 1 },
});

