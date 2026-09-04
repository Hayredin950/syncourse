import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import { Confirm } from "../components/Confirm";
import { Empty, Failed } from "../components/Empty";
import { Toast, useToast } from "../components/Note";
import { Press } from "../components/Press";
import { Sheet } from "../components/Sheet";
import { SkProfile } from "../components/Skeleton";
import { Text, TextInput } from "../components/Type";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { cloudinaryUrl } from "../lib/cloudinary";
import { colors, radius } from "../lib/tokens";
import type { UserProfileFull } from "../lib/types";

/**
 * Everything about the account, in one scroll.
 *
 * Two things were quietly wrong beyond the styling. Every outcome — "Avatar
 * updated" and "Upload failed" alike — printed in success green at the very
 * bottom of a screen five scrolls long, so the feedback was both invisible and
 * sometimes a lie; and Sign out called the API's `logout()` directly, leaving the
 * auth context still holding a user until something else happened to refresh it.
 */
/** A titled card. The heading used to be a loose Text with margins on both sides. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
        thumbColor={value ? colors.onAccent : colors.muted}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * A wrapping row of pills. The privacy rows put three of these beside their own
 * label on one line, which on a 360px phone left "Everyone" 40px to sit in.
 */
function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.choice}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Press
              key={o.value || "none"}
              style={[styles.segment, on && styles.segmentOn]}
              onPress={() => onChange(o.value)}
              haptic
              accessibilityLabel={`${label}: ${o.label}`}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{o.label}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const GENDERS = [
  { value: "", label: "Prefer not" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Non-binary", label: "Non-binary" },
];

const VISIBILITY = [
  { value: "everyone", label: "Everyone" },
  { value: "friends", label: "Friends" },
  { value: "only-me", label: "Only me" },
];

const PRIVACY_ROWS: { key: string; label: string }[] = [
  { key: "downloadHistory", label: "Download history" },
  { key: "reviews", label: "Reviews in friends' feeds" },
  { key: "watchlist", label: "Saved courses" },
  { key: "likes", label: "Likes" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const {
    data: profile,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me() as Promise<UserProfileFull>,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [telegram, setTelegram] = useState("");
  /* Was a `note` state plus a bare `setTimeout` that nothing cleared — it fired
     into a dead component if you left the page while a toast was up, and stacked
     if two outcomes landed together. */
  const { note, say } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");

  const pickAndUploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      say("Photo permission needed to upload an avatar", true);
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
      say("Avatar updated");
    } catch (e) {
      say((e as Error).message || "Upload failed", true);
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
      say("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => say((e as Error).message || "Could not save that", true),
  });

  const telegramMut = useMutation({
    mutationFn: () => api.linkTelegram(telegram.trim()),
    onSuccess: () => {
      setTelegram("");
      say("Telegram linked");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => say((e as Error).message || "Could not link that account", true),
  });

  const terminateMut = useMutation({
    mutationFn: (sessionId: string) => api.terminateSession(sessionId),
    onSuccess: () => {
      say("Session signed out");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => say((e as Error).message || "Could not end that session", true),
  });

  /* Ending a session can lock a device out, so it asks first — in a sheet, not an
     `Alert`, which does nothing at all in the browser build. */
  const [terminating, setTerminating] = useState<{ id: string; device: string | null } | null>(null);

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
      say("Saved");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => say((e as Error).message || "Could not save that", true),
  });

  const pwMut = useMutation({
    mutationFn: () => api.changePassword(pwCurrent, pwNew),
    onSuccess: () => {
      setPwOpen(false);
      setPwCurrent("");
      setPwNew("");
      say("Password updated");
    },
    onError: (e) => say((e as Error).message || "Could not change password", true),
  });

  if (isLoading) return <SkProfile rows={6} />;

  /* "Sign in to manage your settings" was the answer to every failure, including
     a dropped connection. Only a 401 means there is nobody signed in. */
  if (error || !profile) {
    return (error as api.ApiError | null)?.status === 401 ? (
      <Empty
        icon="settings-outline"
        title="Settings live with your account"
        body="Sign in to change your name, link Telegram and choose what other readers can see."
        action={{ label: "Sign in", href: "/auth" }}
      />
    ) : (
      <Failed title="Could not load your settings" onRetry={() => refetch()} />
    );
  }

  const avatar = cloudinaryUrl(profile.avatarUrl, { width: 160, height: 160 });
  const handle = username.replace(/^@/, "") || profile.username;
  const premium = profile.planType === "premium";
  const pwReady = pwNew.length >= 8 && (!profile.hasPassword || !!pwCurrent);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
        }
      >
        <Text style={styles.title}>Settings</Text>

        <Section title="Profile">
          <View style={styles.avatarRow}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatar, styles.center]}>
                <Text style={styles.avatarText}>{(profile.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.grow}>
              <Press
                style={styles.ghostBtn}
                onPress={pickAndUploadAvatar}
                disabled={uploading}
                accessibilityLabel="Choose a new profile photo"
              >
                <Ionicons name="image-outline" size={15} color={colors.text} />
                <Text style={styles.ghostLabel}>{uploading ? "Uploading…" : "Upload image"}</Text>
              </Press>
              <Text style={styles.hint}>JPEG, PNG, WebP or GIF, up to 5MB.</Text>
            </View>
          </View>

          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            defaultValue={profile.name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.dim}
            accessibilityLabel="Display name"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            defaultValue={profile.username}
            onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_@]/g, ""))}
            placeholder="username"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Username"
          />
          <Text style={styles.hint}>Your profile lives at /@{handle}</Text>

          <Choice
            label="Gender"
            options={GENDERS}
            value={gender || profile.gender || ""}
            onChange={setGender}
          />

          <Text style={styles.label}>Email</Text>
          <Text style={styles.readonly}>{profile.email}</Text>
          {/* Was " ✓ verified" appended to the address as text, so the tick came
              from a fallback font and the state was buried in the same line. */}
          <View style={styles.verifyRow}>
            <Ionicons
              name={profile.isVerified ? "checkmark-circle" : "alert-circle-outline"}
              size={14}
              color={profile.isVerified ? colors.success : colors.muted}
            />
            <Text style={[styles.hint, profile.isVerified && styles.hintOk]}>
              {profile.isVerified ? "Verified" : "Not verified — we can email you a code"}
            </Text>
          </View>

          <Press
            style={styles.primaryBtn}
            onPress={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            haptic="success"
            accessibilityLabel="Save your profile"
          >
            <Text style={styles.primaryLabel}>{saveMut.isPending ? "Saving…" : "Save profile"}</Text>
          </Press>
        </Section>

        <Section title="Telegram">
          {profile.telegramUsername ? (
            <View style={styles.linkedRow}>
              <Ionicons name="paper-plane" size={15} color={colors.accent} />
              <Text style={styles.linkedText}>Linked as @{profile.telegramUsername}</Text>
            </View>
          ) : (
            <Text style={styles.muted}>
              Courses are delivered through the Telegram bot. Link your account and it can reach you
              with reminders about the ones you take.
            </Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="@username, t.me link, or ID"
            placeholderTextColor={colors.dim}
            value={telegram}
            onChangeText={setTelegram}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Telegram username, link or ID"
          />
          {/* `disabled` already dims a Press, so the inline opacity was doubled up. */}
          <Press
            style={styles.primaryBtn}
            disabled={!telegram.trim() || telegramMut.isPending}
            onPress={() => telegramMut.mutate()}
            haptic="success"
            accessibilityLabel="Link this Telegram account"
          >
            <Text style={styles.primaryLabel}>
              {telegramMut.isPending ? "Linking…" : profile.telegramUsername ? "Relink" : "Link Telegram"}
            </Text>
          </Press>
        </Section>

        <Section title="Playback">
          <ToggleRow
            label="Autoplay next lesson"
            hint="Roll straight into the next part when one finishes."
            value={!!profile.settings?.autoplayNext}
            onChange={(v) => settingsMut.mutate({ settings: { ...(profile.settings ?? {}), autoplayNext: v } })}
          />
          <View style={styles.rule} />
          <ToggleRow
            label="Autoplay previews"
            hint="Play a course's preview as soon as you open it."
            value={!!profile.settings?.previewAutoplay}
            onChange={(v) => settingsMut.mutate({ settings: { ...(profile.settings ?? {}), previewAutoplay: v } })}
          />
        </Section>

        <Section title="What others can see">
          {PRIVACY_ROWS.map((r, i) => (
            <View key={r.key}>
              {i > 0 && <View style={styles.rule} />}
              <Choice
                label={r.label}
                options={VISIBILITY}
                value={profile.privacy?.[r.key] ?? "everyone"}
                onChange={(v) => settingsMut.mutate({ privacy: { ...(profile.privacy ?? {}), [r.key]: v } })}
              />
            </View>
          ))}
        </Section>

        <Section title="Password">
          <Text style={styles.muted}>
            {profile.hasPassword
              ? "You can sign in with your email and password."
              : profile.hasGoogle
                ? "You sign in with Google. Setting a password gives you a second way in."
                : "Set a password so you can sign in without a one-time code."}
          </Text>
          <Press
            style={styles.ghostWide}
            onPress={() => setPwOpen(true)}
            accessibilityLabel={profile.hasPassword ? "Change your password" : "Set a password"}
          >
            <Ionicons name="key-outline" size={15} color={colors.text} />
            <Text style={styles.ghostLabel}>{profile.hasPassword ? "Change password" : "Set a password"}</Text>
          </Press>
        </Section>

        <Section title="Support">
          <Text style={styles.muted}>Stuck on a course or a payment? We answer fast.</Text>
          <Press
            style={styles.ghostWide}
            onPress={() => Linking.openURL("mailto:support@syncourse.app")}
            accessibilityLabel="Email support at support@syncourse.app"
          >
            <Ionicons name="mail-outline" size={15} color={colors.text} />
            <Text style={styles.ghostLabel}>Message support</Text>
          </Press>
        </Section>

        <Section title="Legal">
          {(legalDocs ?? []).length === 0 && <Text style={styles.muted}>Our policies will appear here.</Text>}
          {(legalDocs ?? []).map((d, i) => {
            const pending = legalStatus?.pending.find((p) => p.type === d.type);
            const accepted = legalStatus?.accepted.find((a) => a.type === d.type);
            return (
              <View key={d.type}>
                {i > 0 && <View style={styles.rule} />}
                <Press
                  style={styles.row}
                  onPress={() => router.push(`/legal/${d.type}`)}
                  accessibilityLabel={`Read the ${d.title}`}
                >
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle}>{d.title}</Text>
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
                  {/* Was a "›" glyph at 20px, on a different baseline per platform. */}
                  <Ionicons name="chevron-forward" size={16} color={colors.dim} />
                </Press>
              </View>
            );
          })}
        </Section>

        <Section title="Plan">
          <View style={styles.planRow}>
            <View style={[styles.planChip, premium && styles.planChipOn]}>
              <Ionicons
                name={premium ? "ribbon" : "person-outline"}
                size={13}
                color={premium ? colors.accent : colors.muted}
              />
              <Text style={[styles.planChipText, premium && styles.planChipTextOn]}>
                {premium ? "Premium" : "Free"}
              </Text>
            </View>
            <Text style={styles.muted}>
              {premium
                ? profile.planExpiresAt
                  ? `Active until ${new Date(profile.planExpiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
                  : "Active"
                : "Subscribe to open every premium course and resource."}
            </Text>
          </View>
          <Press
            style={styles.ghostWide}
            onPress={() => router.push("/premium")}
            accessibilityLabel={premium ? "See your subscription" : "See premium plans"}
          >
            <Ionicons name="sparkles-outline" size={15} color={colors.text} />
            <Text style={styles.ghostLabel}>{premium ? "Manage subscription" : "See what premium adds"}</Text>
          </Press>
        </Section>

        <Section title="Where you are signed in">
          {(profile.sessions ?? []).length === 0 && <Text style={styles.muted}>No active sessions.</Text>}
          {(profile.sessions ?? []).map((s, i) => (
            <View key={s.id}>
              {i > 0 && <View style={styles.rule} />}
              <View style={styles.row}>
                <View style={styles.sessionIcon}>
                  <Ionicons name="phone-portrait-outline" size={15} color={s.active ? colors.accent : colors.dim} />
                </View>
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>{s.device || "Unknown device"}</Text>
                  <Text style={styles.muted}>
                    {s.ip || "no address"} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    {s.active ? "" : " · ended"}
                  </Text>
                </View>
                {s.active && (
                  <Press
                    style={styles.terminate}
                    onPress={() => setTerminating({ id: s.id, device: s.device })}
                    disabled={terminateMut.isPending}
                    haptic="warning"
                    accessibilityLabel={`Sign out ${s.device || "this device"}`}
                  >
                    <Text style={styles.terminateLabel}>Sign out</Text>
                  </Press>
                )}
              </View>
            </View>
          ))}
        </Section>

        {/* Was `logout()` from the API layer, which cleared the token but left the
            auth context holding a user, so the tabs still looked signed in. */}
        <Press
          style={styles.dangerBtn}
          haptic="warning"
          accessibilityLabel="Sign out of this account"
          onPress={async () => {
            await signOut();
            queryClient.clear();
            router.replace("/");
          }}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.danger} />
          <Text style={styles.dangerLabel}>Sign out</Text>
        </Press>
      </ScrollView>

      {/* Docked to the screen rather than the scroll, so an outcome is visible
          wherever you were when you triggered it. */}
      <Toast note={note} />

      <Confirm
        visible={!!terminating}
        onClose={() => setTerminating(null)}
        title="Sign out this device?"
        body={`${terminating?.device || "That device"} will have to sign in again. This one stays signed in.`}
        confirmLabel="Sign it out"
        pendingLabel="Signing out…"
        pending={terminateMut.isPending}
        onConfirm={() => {
          const id = terminating?.id;
          setTerminating(null);
          if (id) terminateMut.mutate(id);
        }}
      />

      <Sheet
        visible={pwOpen}
        onClose={() => setPwOpen(false)}
        title={profile.hasPassword ? "Change password" : "Set a password"}
        subtitle={
          profile.hasPassword
            ? "You will stay signed in on this device."
            : "Eight characters or more. You can still sign in with Google."
        }
        footer={
          <Press
            style={styles.primaryBtn}
            disabled={!pwReady || pwMut.isPending}
            onPress={() => pwMut.mutate()}
            haptic="success"
            accessibilityLabel="Save this password"
          >
            <Text style={styles.primaryLabel}>{pwMut.isPending ? "Saving…" : "Save password"}</Text>
          </Press>
        }
      >
        {profile.hasPassword && (
          <TextInput
            style={styles.input}
            value={pwCurrent}
            onChangeText={setPwCurrent}
            placeholder="Current password"
            placeholderTextColor={colors.dim}
            secureTextEntry
            accessibilityLabel="Current password"
          />
        )}
        <TextInput
          style={[styles.input, styles.inputSpaced]}
          value={pwNew}
          onChangeText={setPwNew}
          placeholder="New password"
          placeholderTextColor={colors.dim}
          secureTextEntry
          accessibilityLabel="New password"
        />
        <Text style={styles.hint}>
          {pwNew.length === 0
            ? "At least 8 characters."
            : pwNew.length < 8
              ? `${8 - pwNew.length} more to go.`
              : "Long enough."}
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, paddingBottom: 48 },
  center: { alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: { marginTop: 20 },
  heading: { color: colors.dim, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 9,
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 3 },
  label: { color: colors.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  hintOk: { color: colors.success },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  avatarText: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  verifyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  readonly: { color: colors.text, fontSize: 14 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  inputSpaced: { marginTop: 10 },
  choice: { gap: 7 },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segment: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
  },
  /* Was a hard-coded rgba(245,158,11,.14) — the amber from two palettes ago. */
  segmentOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segmentLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  segmentLabelOn: { color: colors.accent },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  ghostWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    marginTop: 3,
  },
  ghostLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 13.5, fontWeight: "800" },
  linkedRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  linkedText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 52, paddingVertical: 4 },
  rowTitle: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
  needsAccept: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  sessionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  terminate: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dangerLine,
  },
  terminateLabel: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  planChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  planChipOn: { backgroundColor: colors.accentSoft },
  planChipText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  planChipTextOn: { color: colors.accent },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    marginTop: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  dangerLabel: { color: colors.danger, fontSize: 13.5, fontWeight: "800" },
});


