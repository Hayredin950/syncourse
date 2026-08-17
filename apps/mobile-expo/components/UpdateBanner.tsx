import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as api from "../lib/api";
import { colors, radius } from "../lib/tokens";
import { applyUpdate, compareVersions, getInstalledVersion } from "../lib/update";

const DISMISSED_KEY = "syncourse:dismissedUpdate";

/**
 * Auto-update banner (PhonoFilm-style): checks the published app version on
 * launch and whenever the app returns to the foreground; when a newer version
 * exists it shows "Update available" with an Update button that applies the
 * OTA update (or opens the builds page when a native rebuild is required).
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
    !!latest &&
    compareVersions(latest.version, installed) > 0 &&
    latest.version !== dismissedVersion;

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
      style={[styles.wrap, { top: insets.top + 4 }]}
    >
      <View style={styles.banner}>
        <View style={styles.iconBadge}>
          <Ionicons name="arrow-up-circle" size={20} color="#000" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>
            Update available — v{latest?.version}
          </Text>
          <Text style={styles.subtitle}>
            You're on v{installed}. A newer build is ready.
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.updateBtn}
            onPress={onUpdate}
            disabled={updating}
            hitSlop={6}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.updateBtnText}>Update</Text>
            )}
          </Pressable>
          <Pressable style={styles.laterBtn} onPress={onLater} hitSlop={6}>
            <Text style={styles.laterBtnText}>Later</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 12,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  updateBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: "center",
  },
  updateBtnText: { color: "#000", fontSize: 12, fontWeight: "800" },
  laterBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  laterBtnText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
});
