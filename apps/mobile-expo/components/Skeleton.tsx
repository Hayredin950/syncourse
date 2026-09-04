import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { colors, radius } from "../lib/tokens";

/**
 * Loading placeholders, in the shape of the thing being loaded.
 *
 * Every screen announced a pending fetch with a centred spinner on an otherwise
 * empty page — which tells a reader nothing except that the app is slow, and
 * then reflows the whole layout when the data lands. These stand in for the real
 * shape, so nothing moves at the moment of arrival.
 *
 * The pulse runs on React Native's own Animated with the native driver rather
 * than Reanimated: Reanimated 4 requires the new architecture and this app runs
 * with `newArchEnabled: false`.
 */
function usePulse() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 720, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
}

/** One shimmering box. */
export function Sk({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = usePulse();
  return <Animated.View style={[styles.box, style, { opacity }]} />;
}

/** A poster card, matching CourseCard's proportions exactly. */
export function SkCard({ width = 132 }: { width?: number }) {
  return (
    <View style={{ width }}>
      <Sk style={{ width, height: Math.round(width * 1.14), borderRadius: radius.md }} />
      <Sk style={{ width: width * 0.92, height: 11, marginTop: 8 }} />
      <Sk style={{ width: width * 0.55, height: 9, marginTop: 6 }} />
    </View>
  );
}

/** A horizontal rail of poster cards, including its section heading. */
export function SkRail({ n = 4, heading = true }: { n?: number; heading?: boolean }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={styles.railWrap}
    >
      {heading && <Sk style={{ width: 130, height: 15, marginBottom: 12, marginHorizontal: 16 }} />}
      <View style={styles.rail}>
        {Array.from({ length: n }, (_, i) => (
          <SkCard key={i} />
        ))}
      </View>
    </View>
  );
}

/** Thumbnail-plus-two-lines rows: lecturer, channel, collection and list pages. */
export function SkRows({ n = 6, thumb = 64 }: { n?: number; thumb?: number }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={styles.row}>
          <Sk style={{ width: thumb, height: Math.round(thumb * 0.75), borderRadius: radius.sm }} />
          <View style={styles.rowBody}>
            <Sk style={{ width: "70%", height: 12 }} />
            <Sk style={{ width: "38%", height: 9, marginTop: 7 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The poster grid used by browse, search results and entity pages. */
export function SkGrid({ n = 6 }: { n?: number }) {
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 5 : width >= 640 ? 4 : 3;
  const card = Math.floor((width - 32 - (cols - 1) * 12) / cols);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.grid}>
      {Array.from({ length: n }, (_, i) => (
        <SkCard key={i} width={card} />
      ))}
    </View>
  );
}

/** A profile head — round photo, name, one meta line — then its titles. */
export function SkProfile({ rows = 5 }: { rows?: number }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.pad}>
      <View style={styles.profile}>
        <Sk style={{ width: 96, height: 96, borderRadius: 48 }} />
        <Sk style={{ width: 170, height: 19, marginTop: 12 }} />
        <Sk style={{ width: 110, height: 11, marginTop: 8 }} />
      </View>
      <Sk style={{ width: 140, height: 15, marginBottom: 14 }} />
      <SkRows n={rows} />
    </View>
  );
}

/** The course page: banner, title, meta, the action row, then curriculum rows. */
export function SkCourse() {
  const { width } = useWindowDimensions();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Sk style={{ width: "100%", height: Math.min(320, Math.round(width * 0.52)), borderRadius: 0 }} />
      <View style={styles.pad}>
        <Sk style={{ width: "82%", height: 24 }} />
        <Sk style={{ width: "46%", height: 12, marginTop: 12 }} />
        <Sk style={{ width: "62%", height: 11, marginTop: 9 }} />
        <View style={styles.actions}>
          <Sk style={{ flex: 1, height: 46, borderRadius: radius.pill }} />
          <Sk style={{ width: 46, height: 46, borderRadius: radius.pill }} />
          <Sk style={{ width: 46, height: 46, borderRadius: radius.pill }} />
        </View>
        <Sk style={{ width: 120, height: 15, marginTop: 26, marginBottom: 14 }} />
        <SkRows n={4} thumb={44} />
      </View>
    </View>
  );
}

/** The home feed: the featured banner, then the first rails under it. */
export function SkHome() {
  const { width } = useWindowDimensions();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.home}>
      <Sk style={{ height: Math.min(300, Math.round(width * 0.62)), borderRadius: 18, marginHorizontal: 16, marginBottom: 22 }} />
      <SkRail />
      <SkRail />
    </View>
  );
}

/** Paragraph-shaped lines, for long-form documents. */
export function SkText({ lines = 8 }: { lines?: number }) {
  // A paragraph's last line is short; without that the block reads as a table.
  const widths = ["100%", "100%", "76%", "100%", "100%", "62%", "92%", "45%"];
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.pad}>
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} style={{ width: widths[i % widths.length] as ViewStyle["width"], height: 11, marginBottom: 11 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surfaceRaised, borderRadius: 6 },
  home: { paddingTop: 12 },
  railWrap: { marginBottom: 26 },
  rail: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowBody: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 },
  profile: { alignItems: "center", marginBottom: 22 },
  pad: { padding: 16 },
});
