import { StyleSheet } from "react-native";
import { colors } from "./tokens";

// Dark theme styles shared across screens — mirrors the web app's Tailwind tokens.
export const theme = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  surface: { backgroundColor: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  body: { color: colors.text, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  dim: { color: colors.dim, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { color: colors.muted, fontSize: 12 },
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: { color: "#000", fontWeight: "800", fontSize: 15 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
});
