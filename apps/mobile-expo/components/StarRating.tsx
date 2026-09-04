import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Press } from "./Press";
import { Text } from "./Type";
import { colors } from "../lib/tokens";
import { plural } from "../lib/types";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Stars, drawn rather than typed.
 *
 * All three of these printed "★" and "☆" through the app's Text, which asks for
 * Manrope — a face with no star in it, so both glyphs came from whichever font
 * the OS fell back to, at its own size and baseline (and "☆" boxes outright on
 * some Android builds). Ionicons has all three shapes, which also makes a half
 * star possible: `"★".repeat(Math.round(value))` had to call 4.5 a 5.
 */

/** Which of the three shapes the nth star of a 1–5 row should take. */
function shape(n: number, value: number): IconName {
  if (value >= n - 0.25) return "star";
  if (value >= n - 0.75) return "star-half";
  return "star-outline";
}

/** One star and the number — the compact form for a card or a row. */
export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <View style={styles.row}>
      <Ionicons name="star" size={size + 1} color={colors.star} />
      <Text style={[styles.value, { fontSize: size + 1 }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

/** Tappable 1–5 star input (mirrors the web StarPicker). */
export function StarPicker({
  value,
  onChange,
  size = 26,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.pickRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Press
          key={n}
          onPress={() => onChange(n)}
          /* A 26px glyph is a 26pt target; the slop takes it to the 44 a thumb needs. */
          hitSlop={9}
          haptic
          accessibilityLabel={`Rate it ${plural(n, "star")}`}
          accessibilityState={{ selected: n === value }}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={size}
            color={n <= value ? colors.star : colors.dim}
          />
        </Press>
      ))}
    </View>
  );
}

/** Full 5-star row (filled, half and outline) for display. */
export function StarRow({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name = shape(n, value);
        return (
          <Ionicons
            key={n}
            name={name}
            size={size + 1}
            color={name === "star-outline" ? colors.dim : colors.star}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  value: { color: colors.muted, fontWeight: "700" },
});
