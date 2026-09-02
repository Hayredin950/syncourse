import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, radius } from "../../lib/tokens";
import { Markdown } from "../../components/Markdown";

/** Fallback headings for the built-in types, used until an admin sets a title. */
const TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund: "Refund Policy",
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function LegalScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // The text is fetched at runtime, so an admin edit reaches installed apps
  // without an OTA update.
  const { data: docs, isLoading } = useQuery({
    queryKey: ["legal", type],
    queryFn: () => api.legalDocuments(type as string),
    enabled: !!type,
  });

  // Where this reader stands with this document — only meaningful signed in.
  const { data: status } = useQuery({
    queryKey: ["legal-status"],
    queryFn: api.pendingLegal,
    enabled: !authLoading && !!user,
  });

  const acceptMut = useMutation({
    mutationFn: () => api.acceptLegal([type as string]),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["legal-status"], fresh);
      // Accepting everything outstanding clears the "please re-accept" notices.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const doc = docs?.find((d) => d.type === type) ?? null;
  const pending = status?.pending.find((d) => d.type === type) ?? null;
  const accepted = status?.accepted.find((d) => d.type === type) ?? null;
  const title = doc?.title || TITLES[type as string] || "Legal";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>SYNCOURSE LEGAL</Text>
      <Text style={styles.title}>{title}</Text>

      {!!doc && (
        <Text style={styles.stamp}>
          Version {doc.version} · effective {stamp(doc.effectiveAt)}
          {doc.updatedAt !== doc.effectiveAt && ` · last edited ${stamp(doc.updatedAt)}`}
        </Text>
      )}

      {!!pending && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {pending.previousVersion
              ? `Updated since you accepted v${pending.previousVersion}`
              : "Not accepted yet"}
          </Text>
          {!!pending.changeSummary && (
            <Text style={styles.cardBody}>{pending.changeSummary}</Text>
          )}
          {!!acceptMut.error && (
            <Text style={styles.error}>
              {acceptMut.error instanceof Error
                ? acceptMut.error.message
                : "Could not record that — try again."}
            </Text>
          )}
          <Pressable
            style={[styles.primaryBtn, acceptMut.isPending && { opacity: 0.5 }]}
            onPress={() => acceptMut.mutate()}
            disabled={acceptMut.isPending}
          >
            <Text style={styles.primaryLabel}>
              {acceptMut.isPending ? "Saving…" : `Accept version ${pending.version}`}
            </Text>
          </Pressable>
        </View>
      )}

      {!pending && !!accepted && (
        <Text style={styles.stamp}>
          You accepted version {accepted.version} on {stamp(accepted.acceptedAt)}.
        </Text>
      )}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.body}>
          <Markdown text={doc?.bodyMd || "Document coming soon."} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 6 },
  stamp: { color: colors.muted, fontSize: 11, marginTop: 8 },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 14,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  primaryLabel: { color: "#000", fontSize: 13, fontWeight: "800" },
  body: { marginTop: 18 },
});
