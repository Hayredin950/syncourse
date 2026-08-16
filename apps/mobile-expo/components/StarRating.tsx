import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/tokens";

export function Stars({
  value,
  size = 12,
}: {
  value: number;
  size?: number;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.star, fontSize: size }}>★</Text>
      <Text style={[styles.value, { fontSize: size + 1 }]}>
        {value.toFixed(1)}
      </Text>
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
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
          <Text style={{ color: n <= value ? colors.star : colors.dim, fontSize: size }}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Full 5-star row (filled + outline) for display. */
export function StarRow({
  value,
  size = 12,
}: {
  value: number;
  size?: number;
}) {
  const rounded = Math.round(value);
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.star, fontSize: size }}>{"★".repeat(rounded)}</Text>
      <Text style={{ color: colors.dim, fontSize: size }}>{"☆".repeat(5 - rounded)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  value: { color: colors.muted, fontWeight: "700" },
});
