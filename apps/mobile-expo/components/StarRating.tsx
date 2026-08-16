import React from "react";
import { StyleSheet, Text, View } from "react-native";
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  value: { color: colors.muted, fontWeight: "700" },
});
