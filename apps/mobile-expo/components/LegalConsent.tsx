import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Note } from "./Note";
import { Press } from "./Press";
import { Sheet } from "./Sheet";
import { Text } from "./Type";
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
 *
 * It is the shared `Sheet` now. Its own Modal had the two faults that sheet was
 * built to fix: a `maxHeight: 260` ScrollView nested inside a panel that could
 * not scroll, so three documents put the buttons past the bottom of the screen,
 * and no way out but the backdrop.
 */
export default function LegalConsent() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
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
  const accept =
    pending.length === 1 ? "Accept" : pending.length === 2 ? "Accept both" : "Accept all";

  return (
    <Sheet
      visible
      onClose={later}
      /* The document names live in the body: the sheet's title is one line, and
         "We've updated our Terms of Service and Privacy Policy" is not. */
      title={isUpdate ? "Your agreement has changed" : "Before you continue"}
      subtitle={
        isUpdate
          ? "Your account is still active — we just need your agreement to the new wording."
          : "A quick one-time confirmation so you know where you stand with us."
      }
      footer={
        <View style={styles.actions}>
          <Press
            style={styles.laterBtn}
            onPress={later}
            disabled={acceptMut.isPending}
            accessibilityLabel="Remind me later"
          >
            <Text style={styles.laterLabel}>Later</Text>
          </Press>
          {/* `disabled` already dims a Press, so the inline opacity was doubled up. */}
          <Press
            style={styles.acceptBtn}
            onPress={() => acceptMut.mutate()}
            disabled={acceptMut.isPending}
            haptic="success"
            accessibilityLabel={`${accept} — ${joinTitles(pending)}`}
          >
            <Text style={styles.acceptLabel}>{acceptMut.isPending ? "Saving…" : accept}</Text>
          </Press>
        </View>
      }
    >
      <Text style={styles.lead}>
        {isUpdate
          ? `We've updated our ${joinTitles(changed)}.`
          : `Please accept our ${joinTitles(pending)} to carry on.`}
      </Text>

      <View style={styles.docs}>
        {pending.map((d) => (
          <View key={d.type} style={styles.doc}>
            <View style={styles.docHead}>
              <Ionicons name="document-text-outline" size={15} color={colors.accent} />
              <Text style={styles.docTitle}>{d.title}</Text>
            </View>
            <Text style={styles.docVersion}>
              v{d.version}
              {d.previousVersion ? ` · you accepted v${d.previousVersion}` : ""}
            </Text>
            {!!d.changeSummary && <Text style={styles.docSummary}>{d.changeSummary}</Text>}
            {/* Was an underlined 12px sentence, which is 12px of tap target. */}
            <Press
              style={styles.readBtn}
              onPress={() => read(d.type)}
              accessibilityLabel={`Read the ${d.title}`}
            >
              <Text style={styles.readLabel}>Read it</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.accent} />
            </Press>
          </View>
        ))}
      </View>

      {!!acceptMut.error && (
        <Note
          bad
          text={
            acceptMut.error instanceof Error
              ? acceptMut.error.message
              : "Could not record that — try again."
          }
          style={styles.error}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.body, fontSize: 13, lineHeight: 19 },
  docs: { gap: 10, marginTop: 14 },
  doc: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    gap: 3,
  },
  docHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  docTitle: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: "800" },
  docVersion: { color: colors.muted, fontSize: 11 },
  docSummary: { color: colors.body, fontSize: 12, lineHeight: 17, marginTop: 3 },
  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 38,
    paddingHorizontal: 13,
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  readLabel: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  error: { marginTop: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  acceptBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  acceptLabel: { color: colors.onAccent, fontSize: 13.5, fontWeight: "800" },
  laterBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  laterLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
});
