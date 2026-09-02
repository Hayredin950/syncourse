import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/tokens";
import type { PendingLegalDoc } from "../lib/types";

const SNOOZE_KEY = "syncourse:legalSnooze";
/**
 * The web sheet returns on the next visit; a phone app is never "revisited", so
 * "Later" buys a day of quiet instead. A version bump re-prompts immediately
 * because the stored key includes it.
 */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** "Terms of Service and Privacy Policy" rather than a bare comma list. */
const joinTitles = (docs: PendingLegalDoc[]) =>
  docs
    .map((d) => d.title)
    .reduce((acc, t, i) => (i === 0 ? t : i === docs.length - 1 ? `${acc} and ${t}` : `${acc}, ${t}`), "");

const keyOf = (docs: PendingLegalDoc[]) => docs.map((d) => `${d.type}@${d.version}`).join(",");

/**
 * Asks a signed-in reader to accept legal documents they have not agreed to in
 * their current version — which is how an admin edit reaches people who already
 * accepted the old wording (the API also sends them a notification).
 *
 * Deliberately not a hard gate: consent extracted by locking someone out of an
 * app they paid for is worth less than consent given freely, and a hiccup on
 * /legal/pending must never be able to brick the app. React Query swallowing
 * that failure leaves `data` undefined, which renders nothing.
 */
export default function LegalConsent() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [snoozeKey, setSnoozeKey] = useState<string | null>(null);
  const [snoozeReady, setSnoozeReady] = useState(false);

  // Mid-sign-in is not the moment to interrupt.
  const muted = pathname === "/auth" || pathname.startsWith("/legal");

  const { data: status } = useQuery({
    queryKey: ["legal-status"],
    queryFn: api.pendingLegal,
    enabled: !loading && !!user,
    staleTime: 60_000,
  });

  // Load the persisted "Later", dropping it once it has aged out.
  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { key?: string; at?: number };
        if (saved?.key && typeof saved.at === "number" && Date.now() - saved.at < SNOOZE_MS) {
          setSnoozeKey(saved.key);
        }
      })
      .catch(() => {})
      .finally(() => setSnoozeReady(true));
  }, []);

  const pending = status?.pending ?? [];

  const acceptMut = useMutation({
    mutationFn: () => api.acceptLegal(pending.map((d) => d.type)),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["legal-status"], fresh);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      AsyncStorage.removeItem(SNOOZE_KEY).catch(() => {});
      setSnoozeKey(null);
    },
  });

  const later = () => {
    const key = keyOf(pending);
    AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify({ key, at: Date.now() })).catch(() => {});
    setSnoozeKey(key);
  };

  const read = (type: string) => {
    later();
    router.push(`/legal/${type}`);
  };

  if (muted || !snoozeReady || pending.length === 0 || snoozeKey === keyOf(pending)) return null;

  // Someone who accepted an earlier version is being told their agreement
  // changed; someone new is just being asked. Same sheet, different headline.
  const changed = pending.filter((d) => d.previousVersion);
  const isUpdate = changed.length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.eyebrow}>{isUpdate ? "UPDATED" : "BEFORE YOU CONTINUE"}</Text>
          <Text style={styles.title}>
            {isUpdate
              ? `We've updated our ${joinTitles(changed)}`
              : `Please accept our ${joinTitles(pending)}`}
          </Text>
          <Text style={styles.subtitle}>
            {isUpdate
              ? "Your account is still active — we just need your agreement to the new wording."
              : "A quick one-time confirmation so you know where you stand with us."}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 12 }}>
            {pending.map((d) => (
              <View key={d.type}>
                <Text style={styles.docTitle}>
                  {d.title}{" "}
                  <Text style={styles.docVersion}>
                    v{d.version}
                    {d.previousVersion ? ` · you accepted v${d.previousVersion}` : ""}
                  </Text>
                </Text>
                {!!d.changeSummary && <Text style={styles.docSummary}>{d.changeSummary}</Text>}
                <Pressable onPress={() => read(d.type)} hitSlop={6}>
                  <Text style={styles.readIt}>Read it</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          {!!acceptMut.error && (
            <Text style={styles.error}>
              {acceptMut.error instanceof Error
                ? acceptMut.error.message
                : "Could not record that — try again."}
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              style={[styles.acceptBtn, acceptMut.isPending && { opacity: 0.5 }]}
              onPress={() => acceptMut.mutate()}
              disabled={acceptMut.isPending}
            >
              <Text style={styles.acceptLabel}>
                {acceptMut.isPending
                  ? "Saving…"
                  : pending.length === 1
                    ? "Accept"
                    : pending.length === 2
                      ? "Accept both"
                      : "Accept all"}
              </Text>
            </Pressable>
            <Pressable style={styles.laterBtn} onPress={later} disabled={acceptMut.isPending}>
              <Text style={styles.laterLabel}>Later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 19, fontWeight: "800", marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  list: {
    maxHeight: 260,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 14,
  },
  docTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  docVersion: { color: colors.muted, fontSize: 11, fontWeight: "500" },
  docSummary: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  readIt: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
    marginTop: 4,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  acceptBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  acceptLabel: { color: "#000", fontSize: 13.5, fontWeight: "800" },
  laterBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  laterLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
});
