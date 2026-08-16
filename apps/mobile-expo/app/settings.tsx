import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { logout } from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { UserProfileFull } from "../lib/types";

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me() as Promise<UserProfileFull>,
  });

  const [name, setName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [saved, setSaved] = useState("");

  const saveMut = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim() || undefined }),
    onSuccess: () => {
      setSaved("Profile updated");
      setTimeout(() => setSaved(""), 2000);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const telegramMut = useMutation({
    mutationFn: () => api.linkTelegram(telegram.trim()),
    onSuccess: () => {
      setSaved("Telegram linked");
      setTelegram("");
      setTimeout(() => setSaved(""), 2000);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const terminateMut = useMutation({
    mutationFn: (sessionId: string) => api.terminateSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to manage your settings</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          defaultValue={profile.name}
          onChangeText={setName}
          placeholderTextColor={colors.dim}
        />
        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{profile.email}{profile.isVerified ? " ✓ verified" : " (verify via email code)"}</Text>
        <Text style={styles.label}>Username</Text>
        <Text style={styles.readonly}>@{profile.username}</Text>
        <Pressable style={styles.primaryBtn} onPress={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <Text style={styles.primaryLabel}>{saveMut.isPending ? "…" : "Save"}</Text>
        </Pressable>
      </View>

      <Text style={styles.heading}>Telegram</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>
          {profile.telegramUsername
            ? `Linked: @${profile.telegramUsername}`
            : "Link your Telegram to receive lesson reminders and bot notifications"}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="@username, t.me link, or ID"
          placeholderTextColor={colors.dim}
          value={telegram}
          onChangeText={setTelegram}
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.primaryBtn, !telegram.trim() && { opacity: 0.4 }]}
          disabled={!telegram.trim() || telegramMut.isPending}
          onPress={() => telegramMut.mutate()}
        >
          <Text style={styles.primaryLabel}>{telegramMut.isPending ? "…" : "Link Telegram"}</Text>
        </Pressable>
      </View>

      <Text style={styles.heading}>Sessions</Text>
      <View style={styles.card}>
        {(profile.sessions ?? []).length === 0 && <Text style={styles.muted}>No active sessions</Text>}
        {profile.sessions?.map((s) => (
          <View key={s.id} style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionDevice}>{s.device || "Unknown device"}</Text>
              <Text style={styles.muted}>
                {s.ip || "—"} · {s.active ? "active" : "terminated"}
              </Text>
            </View>
            {s.active && (
              <Pressable onPress={() => terminateMut.mutate(s.id)}>
                <Text style={styles.terminate}>Terminate</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Plan</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>
          {profile.planType === "premium"
            ? `Premium${profile.planExpiresAt ? ` until ${new Date(profile.planExpiresAt).toLocaleDateString()}` : ""}`
            : "Free plan — subscribe on the web checkout to unlock premium"}
        </Text>
      </View>

      {!!saved && <Text style={styles.saved}>{saved}</Text>}

      <Pressable
        style={styles.dangerBtn}
        onPress={async () => {
          await logout();
          queryClient.clear();
          router.replace("/");
        }}
      >
        <Text style={styles.dangerLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.muted, fontSize: 12 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 8 },
  label: { color: colors.dim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  readonly: { color: colors.text, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  primaryLabel: { color: "#000", fontWeight: "800" },
  sessionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  sessionDevice: { color: colors.text, fontSize: 13, fontWeight: "600" },
  terminate: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  saved: { color: colors.success, fontSize: 13, textAlign: "center", marginTop: 14 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 22,
  },
  dangerLabel: { color: colors.danger, fontWeight: "700" },
});
