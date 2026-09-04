import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, fonts, radius } from "../lib/tokens";
import { Press } from "./Press";
import { Text } from "./Type";

/**
 * The nothing-here state.
 *
 * Screens either rendered an empty list — a blank rectangle, which reads as a
 * bug — or a lone grey sentence. This gives the reader the same three things
 * every time: a glyph, what is empty, and the one tap that would fill it.
 */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: { label: string; href?: string; onPress?: () => void };
}) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.glyph}>
        <Ionicons name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {!!action && (
        <Press
          style={styles.action}
          onPress={() => (action.href ? router.push(action.href as never) : action.onPress?.())}
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Press>
      )}
    </View>
  );
}

/** The same shape for a failed fetch, so a dead link never leaves a blank page. */
export function Failed({
  title = "That did not load",
  body = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <Empty
      icon="cloud-offline-outline"
      title={title}
      body={body}
      action={onRetry ? { label: "Try again", onPress: onRetry } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 44,
    paddingHorizontal: 28,
    gap: 6,
  },
  glyph: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 300,
  },
  action: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  actionText: { color: colors.onAccent, fontFamily: fonts.w800, fontSize: 13 },
});
