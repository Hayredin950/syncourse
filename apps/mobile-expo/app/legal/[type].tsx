import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkText } from "../../components/Skeleton";
import { Text } from "../../components/Type";
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
  const { data: docs, isLoading, error, refetch, isRefetching } = useQuery({
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
  const { width } = useWindowDimensions();
  // A legal document at full tablet width is a 1000px measure — unreadable.
  const gutter = Math.max(16, Math.round((width - 680) / 2));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
    >
      <Text style={styles.eyebrow}>SYNCOURSE LEGAL</Text>
      <Text style={styles.title}>{title}</Text>

      {!!doc && (
        <Text style={[styles.stamp, styles.stampTop]}>
          Version {doc.version} · effective {stamp(doc.effectiveAt)}
          {doc.updatedAt !== doc.effectiveAt && ` · last edited ${stamp(doc.updatedAt)}`}
        </Text>
      )}

      {!!pending && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="alert-circle" size={17} color={colors.accent} />
            <Text style={styles.cardTitle}>
              {pending.previousVersion
                ? `Updated since you accepted v${pending.previousVersion}`
                : "Not accepted yet"}
            </Text>
          </View>
          {!!pending.changeSummary && <Text style={styles.cardBody}>{pending.changeSummary}</Text>}
          {!!acceptMut.error && (
            <Text style={styles.error}>
              {acceptMut.error instanceof Error
                ? acceptMut.error.message
                : "Could not record that — try again."}
            </Text>
          )}
          {/* `disabled` already dims a Press, so the inline opacity was doubled up. */}
          <Press
            style={styles.primaryBtn}
            onPress={() => acceptMut.mutate()}
            disabled={acceptMut.isPending}
            haptic="success"
            accessibilityLabel={`Accept version ${pending.version}`}
          >
            <Text style={styles.primaryLabel}>
              {acceptMut.isPending ? "Saving…" : `Accept version ${pending.version}`}
            </Text>
          </Press>
        </View>
      )}

      {!pending && !!accepted && (
        <View style={styles.acceptedRow}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={styles.stamp}>
            You accepted version {accepted.version} on {stamp(accepted.acceptedAt)}.
          </Text>
        </View>
      )}

      {isLoading ? (
        // Was a lone spinner, which for a wall of text says nothing about what's coming.
        <View style={styles.body}>
          <SkText lines={12} />
        </View>
      ) : error ? (
        <View style={styles.body}>
          <Failed
            title="Could not load this document"
            body="It is fetched live so an edit reaches you without an app update."
            onRetry={() => refetch()}
          />
        </View>
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
  content: { paddingVertical: 16, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 },
  stamp: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  stampTop: { marginTop: 8 },
  acceptedRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 14,
    gap: 7,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  body: { marginTop: 18 },
});
