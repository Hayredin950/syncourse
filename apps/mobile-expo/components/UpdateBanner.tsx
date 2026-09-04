import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Press } from "./Press";
import { Text } from "./Type";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { applyUpdate, compareVersions, getInstalledVersion } from "../lib/update";

const DISMISSED_KEY = "syncourse:dismissedUpdate";

/**
 * Auto-update banner: checks the published app version on launch and whenever the
 * app returns to the foreground; when a newer version exists it offers to apply
 * the OTA update (or opens the builds page when a native rebuild is required).
 *
 * The copy and the buttons used to sit on one row, so on a 360px phone "Update
 * available — v1.1.0" wrapped to three lines against a 72px button. They are
 * stacked now: the version reads on its own line and the actions get full width.
 */
export default function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const appState = useRef(AppState.currentState);

  const { data: versions, refetch } = useQuery({
    queryKey: ["app-versions"],
    queryFn: api.appVersions,
    staleTime: 60_000,
  });

  // Re-check when the app returns to the foreground (auto-update behavior).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        refetch();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [refetch]);

  // Load the persisted dismissal once.
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((v) => setDismissedVersion(v));
  }, []);

  const installed = getInstalledVersion();
  const latest = versions && versions.length > 0 ? versions[0] : null;
  const updateAvailable =
    !!latest && compareVersions(latest.version, installed) > 0 && latest.version !== dismissedVersion;

  if (!updateAvailable) return null;

  const onUpdate = async () => {
    setUpdating(true);
    try {
      await applyUpdate();
    } finally {
      setUpdating(false);
    }
  };

  const onLater = () => {
    if (latest) {
      AsyncStorage.setItem(DISMISSED_KEY, latest.version).catch(() => {});
      setDismissedVersion(latest.version);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + 4, left: Math.max(12, insets.left + 8), right: Math.max(12, insets.right + 8) },
      ]}
    >
      <View style={styles.banner}>
        <View style={styles.head}>
          <View style={styles.iconBadge}>
            <Ionicons name="arrow-up-circle" size={19} color={colors.onAccent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Update available</Text>
            <Text style={styles.subtitle}>
              v{latest?.version} is ready. You are on v{installed}.
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Press
            style={styles.laterBtn}
            onPress={onLater}
            accessibilityLabel={`Skip version ${latest?.version} for now`}
          >
            <Text style={styles.laterLabel}>Later</Text>
          </Press>
          <Press
            style={styles.updateBtn}
            onPress={onUpdate}
            disabled={updating}
            haptic="success"
            accessibilityLabel={`Update to version ${latest?.version}`}
          >
            {/* Was an ActivityIndicator, which shrank the label to nothing and
                changed the button's width mid-tap. */}
            <Text style={styles.updateLabel}>{updating ? "Updating…" : "Update now"}</Text>
          </Press>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 1000, elevation: 12 },
  banner: {
    gap: 11,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 13,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  head: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 9 },
  updateBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  updateLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  laterBtn: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  laterLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
});
