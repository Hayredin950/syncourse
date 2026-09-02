import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../lib/api";
import { logout } from "../lib/api";
import { colors, radius } from "../lib/tokens";
import type { UserProfileFull } from "../lib/types";

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} thumbColor={value ? "#fff" : undefined} />
    </View>
  );
}

function PrivacyRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.segmented}>
        {["everyone", "friends", "only-me"].map((opt) => (
          <Pressable
            key={opt}
            style={[styles.segment, value === opt && styles.segmentActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.segmentLabel, value === opt && styles.segmentLabelActive]}>
              {opt === "everyone" ? "Everyone" : opt === "friends" ? "Friends" : "Only me"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me() as Promise<UserProfileFull>,
  });

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [telegram, setTelegram] = useState("");
  const [saved, setSaved] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");

  const pickAndUploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSaved("Photo permission needed to upload an avatar");
      setTimeout(() => setSaved(""), 2500);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    setUploading(true);
    try {
      const r = await api.uploadImage({ dataUrl: `data:image/jpeg;base64,${res.assets[0].base64}` });
      await api.updateProfile({ avatarUrl: r.url });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setSaved("Avatar updated");
      setTimeout(() => setSaved(""), 2000);
    } catch (e: any) {
      setSaved(e?.message ?? "Upload failed");
      setTimeout(() => setSaved(""), 2500);
    } finally {
      setUploading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateProfile({
        name: name.trim() || undefined,
        username: username.trim().replace(/^@/, "") || undefined,
        gender: gender.trim() || undefined,
      }),
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

  // Listed from the API rather than hard-coded, so a document an admin adds or
  // renames shows up here without shipping a new build.
  const { data: legalDocs } = useQuery({
    queryKey: ["legal"],
    queryFn: () => api.legalDocuments(),
  });
  const { data: legalStatus } = useQuery({
    queryKey: ["legal-status"],
    queryFn: api.pendingLegal,
    enabled: !isLoading && !!profile,
  });

  const settingsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateProfile(body),
    onSuccess: () => {
      setSaved("Saved");
      setTimeout(() => setSaved(""), 2000);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const pwMut = useMutation({
    mutationFn: () => api.changePassword(pwCurrent, pwNew),
    onSuccess: () => {
      setPwOpen(false);
      setPwCurrent("");
      setPwNew("");
      setSaved("Password updated");
      setTimeout(() => setSaved(""), 2000);
    },
    onError: (e: any) => setSaved(e?.message ?? "Could not change password"),
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
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={{ width: 52, height: 52, borderRadius: 26 }} />
            ) : (
              <Text style={styles.avatarText}>{(profile.name || "?").charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Pressable style={styles.ghostBtn} onPress={pickAndUploadAvatar} disabled={uploading}>
            <Text style={styles.ghostLabel}>{uploading ? "Uploading…" : "Upload image"}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>JPEG, PNG, WebP or GIF, up to 5MB.</Text>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          defaultValue={profile.name}
          onChangeText={setName}
          placeholderTextColor={colors.dim}
        />
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          defaultValue={profile.username}
          onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_@]/g, ""))}
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Your profile URL will be /@{username.replace(/^@/, "") || profile.username}</Text>
        <Text style={styles.label}>Gender</Text>
        <View style={styles.segmented}>
          {["", "Male", "Female", "Non-binary"].map((g) => (
            <Pressable
              key={g || "na"}
              style={[styles.segment, (gender || profile.gender || "") === g && styles.segmentActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.segmentLabel, (gender || profile.gender || "") === g && styles.segmentLabelActive]}>
                {g || "Prefer not"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{profile.email}{profile.isVerified ? " ✓ verified" : " (verify via email code)"}</Text>
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

      <Text style={styles.heading}>Playback</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Autoplay next lesson"
          value={!!(profile.settings as any)?.autoplayNext}
          onChange={(v) => settingsMut.mutate({ settings: { ...(profile.settings ?? {}), autoplayNext: v } })}
        />
        <ToggleRow
          label="Autoplay previews"
          value={!!(profile.settings as any)?.previewAutoplay}
          onChange={(v) => settingsMut.mutate({ settings: { ...(profile.settings ?? {}), previewAutoplay: v } })}
        />
      </View>

      <Text style={styles.heading}>What others can see</Text>
      <View style={styles.card}>
        {[
          ["watchHistory", "Watch history"],
          ["reviews", "Reviews in friends' feeds"],
          ["watchlist", "Watchlist"],
          ["likes", "Likes"],
        ].map(([key, label]) => (
          <PrivacyRow
            key={key}
            label={label}
            value={(profile.privacy as Record<string, string>)?.[key] ?? "everyone"}
            onChange={(v) => settingsMut.mutate({ privacy: { ...(profile.privacy ?? {}), [key]: v } })}
          />
        ))}
      </View>

      <Text style={styles.heading}>Password</Text>
      <View style={styles.card}>
        <Pressable style={styles.ghostBtn} onPress={() => setPwOpen(true)}>
          <Text style={styles.ghostLabel}>
            {profile.hasPassword ? "Change password" : "Set a password"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.heading}>Support</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>Stuck on a course or a payment? We answer fast.</Text>
        <Pressable style={styles.ghostBtn} onPress={() => Linking.openURL("mailto:support@syncourse.app")}>
          <Text style={styles.ghostLabel}>Message support</Text>
        </Pressable>
      </View>

      <Text style={styles.heading}>Legal</Text>
      <View style={styles.card}>
        {(legalDocs ?? []).length === 0 && (
          <Text style={styles.muted}>Our policies will appear here.</Text>
        )}
        {(legalDocs ?? []).map((d) => {
          const pending = legalStatus?.pending.find((p) => p.type === d.type);
          const accepted = legalStatus?.accepted.find((a) => a.type === d.type);
          return (
            <Pressable
              key={d.type}
              style={styles.sessionRow}
              onPress={() => router.push(`/legal/${d.type}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionDevice}>{d.title}</Text>
                <Text style={pending ? styles.needsAccept : styles.muted}>
                  {pending
                    ? pending.previousVersion
                      ? `Updated to v${d.version} — needs your acceptance`
                      : `v${d.version} — needs your acceptance`
                    : accepted
                      ? `Accepted v${accepted.version}`
                      : `v${d.version}`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
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

      {pwOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPwOpen(false)}>
          <Pressable style={styles.forgotBackdrop} onPress={() => setPwOpen(false)}>
            <Pressable style={styles.forgotCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.forgotTitle}>{profile.hasPassword ? "Change password" : "Set a password"}</Text>
              {profile.hasPassword && (
                <TextInput
                  style={styles.input}
                  value={pwCurrent}
                  onChangeText={setPwCurrent}
                  placeholder="Current password"
                  placeholderTextColor={colors.dim}
                  secureTextEntry
                />
              )}
              <TextInput
                style={styles.input}
                value={pwNew}
                onChangeText={setPwNew}
                placeholder="New password (min 8 chars)"
                placeholderTextColor={colors.dim}
                secureTextEntry
              />
              <Pressable
                style={[styles.forgotBtn, (pwNew.length < 8 || (profile.hasPassword && !pwCurrent) || pwMut.isPending) && { opacity: 0.4 }]}
                disabled={pwNew.length < 8 || (profile.hasPassword && !pwCurrent) || pwMut.isPending}
                onPress={() => pwMut.mutate()}
              >
                <Text style={styles.forgotBtnLabel}>{pwMut.isPending ? "…" : "Save password"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
  forgotBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  forgotCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  forgotTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  forgotBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 6,
  },
  forgotBtnLabel: { color: "#000", fontWeight: "800", fontSize: 14 },
  label: { color: colors.dim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  ghostLabel: { color: colors.text, fontSize: 12, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 11 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  toggleLabel: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segment: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  segmentActive: { borderColor: colors.accent, backgroundColor: "rgba(245,158,11,.14)" },
  segmentLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  segmentLabelActive: { color: colors.accent },
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
  needsAccept: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  chevron: { color: colors.dim, fontSize: 20 },
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
