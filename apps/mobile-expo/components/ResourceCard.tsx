import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { Text } from "./Type";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import type { ResourceSummary } from "../lib/types";
import { hueFromString } from "./CourseCard";

/**
 * A resource is a document, not a course, so it gets a landscape card instead of
 * the 2:3 poster the catalogue uses — the shape itself tells you which library
 * you are in. Mirrors `apps/web/src/components/ResourceCard.tsx` down to the
 * type labels and the stat order, so the two clients describe one product.
 */

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const RESOURCE_TYPE_META: Record<
  string,
  { label: string; plural: string; icon: IconName }
> = {
  "cheat-sheet": { label: "Cheat-sheet", plural: "Cheat-sheets", icon: "document-text-outline" },
  roadmap: { label: "Roadmap", plural: "Roadmaps", icon: "map-outline" },
  note: { label: "Useful note", plural: "Useful notes", icon: "reader-outline" },
};

export function typeMeta(type: string) {
  return RESOURCE_TYPE_META[type] ?? { label: type, plural: type, icon: "document-outline" as IconName };
}

export const MEDIA_META: Record<string, { label: string; icon: IconName }> = {
  image: { label: "Image", icon: "image-outline" },
  video: { label: "Video", icon: "videocam-outline" },
  audio: { label: "Audio", icon: "musical-notes-outline" },
  pdf: { label: "PDF", icon: "document-outline" },
  doc: { label: "Document", icon: "document-text-outline" },
  sheet: { label: "Spreadsheet", icon: "grid-outline" },
  slide: { label: "Slides", icon: "easel-outline" },
  archive: { label: "Archive", icon: "file-tray-full-outline" },
  code: { label: "Code", icon: "code-slash-outline" },
  link: { label: "Link", icon: "link-outline" },
  other: { label: "File", icon: "ellipsis-horizontal-circle-outline" },
};

export function mediaMeta(kind: string) {
  return MEDIA_META[kind] ?? MEDIA_META.other;
}

/** "3 images · 1 PDF" beats "4 attachments" when you are deciding whether to tap. */
export function mediaLine(kinds: string[], count: number): string {
  if (!count) return "Text only";
  const named = kinds.slice(0, 3).map((k) => mediaMeta(k).label.toLowerCase());
  if (!named.length) return `${count} file${count === 1 ? "" : "s"}`;
  return `${count} file${count === 1 ? "" : "s"} · ${named.join(", ")}`;
}

/**
 * A stable tint per resource so a cover-less card still looks deliberate.
 * RN has no CSS gradient without expo-linear-gradient, so the depth comes from
 * a tinted base plus one offset blob rather than a real ramp.
 */
export function resourceTint(seed: string) {
  const hue = hueFromString(seed || "resource");
  return {
    base: `hsl(${hue} 38% 16%)`,
    blob: `hsl(${(hue + 48) % 360} 60% 26%)`,
  };
}

export function ResourceCover({
  resource,
  height,
  glyphSize = 34,
}: {
  resource: ResourceSummary;
  /** Omit to let the cover keep a 16:10 shape at whatever width it is given. */
  height?: number;
  glyphSize?: number;
}) {
  const tint = resourceTint(resource.slug || resource.id);
  const meta = typeMeta(resource.type);
  const box = height ? { height } : { aspectRatio: 16 / 10 };
  if (resource.coverUrl) {
    return (
      <Image
        source={{ uri: cloudinaryUrl(resource.coverUrl, { width: 720 }) ?? undefined }}
        style={[styles.cover, box]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.cover, styles.coverFallback, box, { backgroundColor: tint.base }]}>
      <View style={[styles.coverBlob, { backgroundColor: tint.blob }]} />
      <Ionicons name={meta.icon} size={glyphSize} color="rgba(241,234,221,0.32)" />
    </View>
  );
}

export function ResourceCard({ resource, width }: { resource: ResourceSummary; width?: number }) {
  const router = useRouter();
  const go = useCallback(() => router.push(`/resources/${resource.slug}` as never), [resource.slug, router]);
  const meta = typeMeta(resource.type);

  return (
    <Press
      style={[styles.card, width ? { width } : styles.full]}
      onPress={go}
      accessibilityLabel={`${resource.title}. ${meta.label}${resource.isPremium ? ", premium" : ""}`}
    >
      <View>
        <ResourceCover resource={resource} />
        <View style={styles.typeChip}>
          <Ionicons name={meta.icon} size={11} color={colors.accent} />
          <Text style={styles.typeChipText}>{meta.label}</Text>
        </View>
        {resource.isPremium && (
          <View style={styles.premiumChip}>
            <Text style={styles.premiumChipText}>Premium</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>
          {resource.title}
        </Text>
        {!!resource.summary && (
          <Text numberOfLines={2} style={styles.excerpt}>
            {resource.summary}
          </Text>
        )}
        <View style={styles.foot}>
          <Text numberOfLines={1} style={styles.cat}>
            {resource.category?.name ?? meta.plural}
          </Text>
          <View style={styles.stats}>
            {resource.readMinutes > 0 && <Stat icon="time-outline" value={`${resource.readMinutes}m`} />}
            {resource.mediaCount > 0 && <Stat icon="attach-outline" value={String(resource.mediaCount)} />}
            <Stat icon="eye-outline" value={compact(resource.viewCount)} />
          </View>
        </View>
      </View>
    </Press>
  );
}

/** The wide editor's-pick row: art on the left, room for a real lede on the right. */
export function ResourceFeature({ resource }: { resource: ResourceSummary }) {
  const router = useRouter();
  const go = useCallback(() => router.push(`/resources/${resource.slug}` as never), [resource.slug, router]);
  const meta = typeMeta(resource.type);

  return (
    <Press
      style={styles.feature}
      onPress={go}
      accessibilityLabel={`${resource.title}. ${meta.label}${resource.isPremium ? ", premium" : ""}`}
    >
      <View style={styles.featureArt}>
        <ResourceCover resource={resource} height={104} glyphSize={28} />
      </View>
      <View style={styles.featureBody}>
        <View style={styles.featureKicker}>
          <Ionicons name={meta.icon} size={11} color={colors.accent} />
          <Text style={styles.featureKickerText}>{meta.label.toUpperCase()}</Text>
          {resource.isPremium && <Text style={styles.featureKickerText}>· PREMIUM</Text>}
        </View>
        <Text numberOfLines={2} style={styles.featureTitle}>
          {resource.title}
        </Text>
        {!!resource.summary && (
          <Text numberOfLines={2} style={styles.excerpt}>
            {resource.summary}
          </Text>
        )}
        <Text numberOfLines={1} style={styles.featureMeta}>
          {mediaLine(resource.mediaKinds, resource.mediaCount)}
          {resource.readMinutes > 0 ? ` · ${resource.readMinutes} min read` : ""}
        </Text>
      </View>
    </Press>
  );
}

function Stat({ icon, value }: { icon: IconName; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={11} color={colors.dim} />
      <Text style={styles.statText}>{value}</Text>
    </View>
  );
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n ?? 0);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  cover: { width: "100%", backgroundColor: colors.surfaceRaised },
  full: { width: "100%" },
  coverFallback: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverBlob: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -90,
    right: -70,
    opacity: 0.55,
  },
  typeChip: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(14,13,11,0.82)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeChipText: { color: colors.text, fontSize: 10, fontWeight: "700" },
  premiumChip: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumChipText: { color: colors.onAccent, fontSize: 9, fontWeight: "800" },
  body: { padding: 12, gap: 5 },
  title: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  excerpt: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  cat: { color: colors.dim, fontSize: 11, flexShrink: 1 },
  stats: { flexDirection: "row", alignItems: "center", gap: 10 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { color: colors.dim, fontSize: 11, fontVariant: ["tabular-nums"] },
  feature: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 10,
  },
  featureArt: { width: 116, borderRadius: radius.md, overflow: "hidden" },
  featureBody: { flex: 1, minWidth: 0, gap: 4 },
  featureKicker: { flexDirection: "row", alignItems: "center", gap: 4 },
  featureKickerText: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  featureTitle: { color: colors.text, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  featureMeta: { color: colors.dim, fontSize: 11, marginTop: 2 },
});
