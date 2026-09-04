import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Note } from "../components/Note";
import { Press } from "../components/Press";
import { Sheet } from "../components/Sheet";
import { Text, TextInput } from "../components/Type";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/tokens";

WebBrowser.maybeCompleteAuthSession();

// Google sign-in goes through our own API rather than talking to Google here.
// The only OAuth client this project has is a Web client — it is the one the
// API holds the secret for — and Google will not redirect a Web client to a
// custom scheme: asking it to land on syncourse:// gets "Access blocked …
// Error 400: invalid_request — this app doesn't comply with Google's OAuth 2.0
// policy for keeping apps secure". So the app opens /api/auth/google in a
// system browser, Google redirects to the API's registered https callback, the
// API exchanges the code with its secret, and it bounces back to the URL below
// with ?token=…. Nothing here has to be registered with Google, which is why
// this file no longer needs a client ID at all.
const RETURN_URL = "syncourse://auth";

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Sign in, create an account, confirm an email, reset a password.
 *
 * Every action here was a bare `<Text onPress>` — the amber "Sign in" block
 * included. A Text is not a button: it announces itself as text, it has no
 * pressed state, and the way it was disabled was `onPress={undefined}`, which
 * leaves something that still looks tappable doing nothing at all. Beyond that:
 * the two modes were a sentence you had to read to the end ("New here? Create
 * an account"), the placeholders were doing the labels' job, and one `busy` flag
 * drove both buttons — so opening Google made the sign-in button say "Signing
 * in…" while the real sign-in button sat there enabled.
 */
export default function AuthScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { width } = useWindowDimensions();
  /* A form wants a short line length, so the card stops at 460 and centres. */
  const gutter = Math.max(20, Math.round((width - 460) / 2));
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Shared `busy` with the form before, so the submit button reported the
     browser's progress as its own. */
  const [googleBusy, setGoogleBusy] = useState(false);
  // Password recovery. Steps through email -> 6-digit code -> new password.
  // A code rather than a magic link: on a phone the link usually lands in spam,
  // and bouncing out to a browser mid-signup loses the app context entirely.
  const [resetStep, setResetStep] = useState<"hidden" | "email" | "otp" | "password">("hidden");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // email verification (hard verify: sign-in blocked until confirmed)
  const [verifying, setVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  const usernameOk = /^[A-Za-z0-9_]{3,}$/.test(username.trim());
  const emailOk = EMAIL.test(email.trim());
  /* The button was live from the first render, so the commonest outcome of
     tapping it was a red line from the server. */
  const canSubmit =
    !busy &&
    emailOk &&
    password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || (!!name.trim() && usernameOk));

  const startGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${api.API_URL}/api/auth/google?redirect=${encodeURIComponent(RETURN_URL)}`,
        RETURN_URL,
      );
      // "dismiss"/"cancel" just means the sheet was closed — not an error worth showing.
      if (result.type !== "success") return;
      // Read the token by hand: Hermes' URL has no searchParams.
      const token = /[?&]token=([^&#]+)/.exec(result.url)?.[1];
      if (!token) {
        setError("Google sent us back without a token — please try again.");
        return;
      }
      await api.setToken(decodeURIComponent(token));
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const needsVerify = await api.register(name, username.trim(), email, password);
        if (needsVerify) {
          setVerifying(true);
          setVerifyEmail(email);
          setVerifyMsg("We emailed you a 6-digit code. Enter it below to finish creating your account.");
          setBusy(false);
          return;
        }
      } else {
        await api.login(email, password);
      }
      await refresh();
      router.replace("/");
    } catch (e) {
      const status = e instanceof api.ApiError ? e.status : null;
      if (status === 403) {
        setVerifying(true);
        setVerifyEmail(email);
        setVerifyMsg("Please confirm your email with the 6-digit code we sent you.");
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setError(null);
    setVerifyMsg(null);
    setBusy(true);
    try {
      const res = await api.verifyEmail(verifyEmail, verifyCode);
      await api.setToken(res.accessToken);
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setResendBusy(true);
    setError(null);
    setVerifyMsg(null);
    try {
      await api.resendVerification(verifyEmail);
      setVerifyMsg("A new code is on its way — check your inbox (and spam).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the code");
    } finally {
      setResendBusy(false);
    }
  };

  const openReset = () => {
    setResetStep("email");
    setResetEmail(email);
    setResetOtp("");
    setNewPassword("");
    setResetToken("");
    setResetErr(null);
    setResetMsg(null);
  };

  const closeReset = () => {
    setResetStep("hidden");
    setResetOtp("");
    setNewPassword("");
    setResetToken("");
    setResetErr(null);
    setResetMsg(null);
  };

  /** Step 1 — ask for a code. */
  const requestReset = async () => {
    if (!EMAIL.test(resetEmail.trim())) return;
    setResetBusy(true);
    setResetErr(null);
    setResetMsg(null);
    try {
      await api.forgotPassword(resetEmail.trim());
      setResetStep("otp");
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "Could not send the reset code");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 2 — trade the code for a short-lived token. */
  const verifyResetOtp = async () => {
    setResetBusy(true);
    setResetErr(null);
    setResetMsg(null);
    try {
      const res = await api.verifyResetCode(resetEmail.trim(), resetOtp);
      setResetToken(res.resetToken);
      setResetStep("password");
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "That code was not accepted");
    } finally {
      setResetBusy(false);
    }
  };

  /** Step 3 — save the new password, then sign straight in with it. */
  const saveNewPassword = async () => {
    setResetBusy(true);
    setResetErr(null);
    setResetMsg(null);
    try {
      await api.resetPassword(resetToken, newPassword);
      const chosen = newPassword;
      const addr = resetEmail.trim();
      closeReset();
      // Signing in here saves retyping what was just chosen. If it fails the
      // reset still succeeded, so fall back to the form with a clear message.
      try {
        await api.login(addr, chosen);
        await refresh();
        router.replace("/");
      } catch {
        setMode("login");
        setEmail(addr);
        setPassword("");
        setError("Password updated — sign in with your new password.");
      }
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "Could not update the password");
    } finally {
      setResetBusy(false);
    }
  };

  /** A fresh code; the API rate-limits this to one a minute. */
  const resendReset = async () => {
    setResetBusy(true);
    setResetErr(null);
    setResetMsg(null);
    try {
      await api.forgotPassword(resetEmail.trim());
      setResetOtp("");
      /* Was an Alert.alert on top of the sheet — an OS dialog interrupting a
         sheet that is already asking for one thing. */
      setResetMsg("A new code is on its way — check your inbox (and spam).");
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "Could not resend the code");
    } finally {
      setResetBusy(false);
    }
  };

  // One button at the foot of the reset sheet, so the step decides what it does
  // and what it says rather than each step carrying its own button.
  const resetReady =
    !resetBusy &&
    (resetStep === "email"
      ? EMAIL.test(resetEmail.trim())
      : resetStep === "otp"
        ? resetOtp.length === 6
        : newPassword.length >= 8);
  const resetLabel = resetBusy
    ? resetStep === "email"
      ? "Sending…"
      : resetStep === "otp"
        ? "Checking…"
        : "Saving…"
    : resetStep === "email"
      ? "Send code"
      : resetStep === "otp"
        ? "Continue"
        : "Save password";
  const runReset =
    resetStep === "email" ? requestReset : resetStep === "otp" ? verifyResetOtp : saveNewPassword;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Was a 56px 🎓 — the platform's own emoji, a different drawing on every
            phone and no relation to the palette. */}
        <View style={styles.mark}>
          <Ionicons name="school" size={30} color={colors.accent} />
        </View>
        <Text style={styles.title}>Syncourse</Text>
        <Text style={styles.subtitle}>
          {verifying ? "Check your email" : "One account across web, app and Telegram"}
        </Text>

        {verifying ? (
          <View style={styles.form}>
            <View style={styles.sentTo}>
              <Ionicons name="mail-outline" size={14} color={colors.accent} />
              <Text style={styles.sentToText} numberOfLines={1}>
                {verifyEmail}
              </Text>
            </View>
            <Field label="Your 6-digit code">
              <TextInput
                value={verifyCode}
                onChangeText={(t) => setVerifyCode(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="——————"
                placeholderTextColor={colors.dim}
                style={[styles.input, styles.code]}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (!busy && verifyCode.length === 6) void confirmCode();
                }}
                autoFocus
              />
            </Field>
            {!!verifyMsg && <Note text={verifyMsg} />}
            {!!error && <Note text={error} bad />}
            <Press
              style={[styles.primary, (busy || verifyCode.length !== 6) && styles.primaryOff]}
              disabled={busy || verifyCode.length !== 6}
              onPress={confirmCode}
              haptic
              accessibilityLabel="Check the code and sign in"
            >
              <Text
                style={[
                  styles.primaryLabel,
                  (busy || verifyCode.length !== 6) && styles.primaryLabelOff,
                ]}
              >
                {busy ? "Checking…" : "Verify & sign in"}
              </Text>
            </Press>
            <Press
              style={styles.link}
              disabled={resendBusy}
              onPress={resendCode}
              accessibilityLabel="Send the code again"
            >
              <Text style={styles.linkText}>
                {resendBusy ? "Sending…" : "Didn't get it? Resend the code"}
              </Text>
            </Press>
            <Press
              style={styles.link}
              onPress={() => {
                setVerifying(false);
                setError(null);
                setVerifyMsg(null);
              }}
              accessibilityLabel="Go back to sign in"
            >
              <Ionicons name="chevron-back" size={13} color={colors.muted} />
              <Text style={styles.linkText}>Back to sign in</Text>
            </Press>
          </View>
        ) : (
          <View style={styles.form}>
            {/* Was "New here? Create an account" — a sentence you had to read to
                the end to find out you were in the other mode. */}
            <View style={styles.segmented}>
              {([
                ["login", "Sign in"],
                ["register", "Create account"],
              ] as const).map(([m, label]) => {
                const on = mode === m;
                return (
                  <Press
                    key={m}
                    style={[styles.seg, on && styles.segOn]}
                    onPress={() => {
                      setMode(m);
                      setError(null);
                    }}
                    haptic
                    accessibilityLabel={label}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.segLabel, on && styles.segLabelOn]}>{label}</Text>
                  </Press>
                );
              })}
            </View>

            {mode === "register" && (
              <>
                <Field label="Your name">
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Abebe Bikila"
                    placeholderTextColor={colors.dim}
                    style={styles.input}
                    autoComplete="name"
                    textContentType="name"
                  />
                </Field>
                <Field
                  label="Username"
                  hint={
                    username.length > 0 && !usernameOk
                      ? "Three characters or more — letters, numbers and _ only."
                      : "This is how others see you. Letters, numbers and _."
                  }
                  bad={username.length > 0 && !usernameOk}
                >
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="abebe"
                    placeholderTextColor={colors.dim}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username-new"
                  />
                </Field>
              </>
            )}
            <Field
              label="Email"
              hint={email.length > 3 && !emailOk ? "That does not look like an email address." : undefined}
              bad={email.length > 3 && !emailOk}
            >
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.dim}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
              />
            </Field>

            <Field
              label="Password"
              hint={
                mode === "register"
                  ? password.length === 0
                    ? "At least 8 characters."
                    : password.length < 8
                      ? `${8 - password.length} more to go.`
                      : "Long enough."
                  : undefined
              }
            >
              {/* The only way to check what you had typed was to clear it and
                  start again. */}
              <View style={styles.pwWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === "register" ? "Choose a password" : "Your password"}
                  placeholderTextColor={colors.dim}
                  style={[styles.input, styles.pwInput]}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  textContentType={mode === "register" ? "newPassword" : "password"}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canSubmit) void submit();
                  }}
                />
                <Press
                  style={styles.eye}
                  onPress={() => setShowPw((v) => !v)}
                  accessibilityLabel={showPw ? "Hide the password" : "Show the password"}
                  accessibilityState={{ selected: showPw }}
                >
                  <Ionicons
                    name={showPw ? "eye-off-outline" : "eye-outline"}
                    size={17}
                    color={colors.dim}
                  />
                </Press>
              </View>
            </Field>

            {!!error && <Note text={error} bad />}

            <Press
              style={[styles.primary, !canSubmit && styles.primaryOff]}
              disabled={!canSubmit}
              onPress={submit}
              haptic
              accessibilityLabel={mode === "register" ? "Create your account" : "Sign in"}
            >
              <Text style={[styles.primaryLabel, !canSubmit && styles.primaryLabelOff]}>
                {busy
                  ? mode === "register"
                    ? "Creating your account…"
                    : "Signing you in…"
                  : mode === "register"
                    ? "Create account"
                    : "Sign in"}
              </Text>
            </Press>

            {mode === "login" && (
              <Press style={styles.link} onPress={openReset} accessibilityLabel="Reset your password">
                <Text style={styles.linkText}>Forgot your password?</Text>
              </Press>
            )}

            <View style={styles.orRow}>
              <View style={styles.rule} />
              <Text style={styles.or}>or</Text>
              <View style={styles.rule} />
            </View>

            {/* Was plain centred text, indistinguishable from the sentence above
                it and with no target of its own. */}
            <Press
              style={styles.googleBtn}
              disabled={googleBusy}
              onPress={startGoogle}
              accessibilityLabel="Continue with Google"
            >
              <Ionicons name="logo-google" size={16} color={colors.text} />
              <Text style={styles.googleLabel}>
                {googleBusy ? "Waiting for Google…" : "Continue with Google"}
              </Text>
            </Press>

            {mode === "register" && (
              <View style={styles.legal}>
                <Text style={styles.legalText}>By creating an account you agree to our</Text>
                <View style={styles.legalRow}>
                  {([
                    ["terms", "Terms"],
                    ["privacy", "Privacy Policy"],
                  ] as const).map(([slug, label]) => (
                    <Press
                      key={slug}
                      style={styles.legalLink}
                      onPress={() => router.push(`/legal/${slug}`)}
                      accessibilityLabel={`Read the ${label}`}
                    >
                      <Text style={styles.legalLinkText}>{label}</Text>
                    </Press>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Was its own Modal, held open by a `stopPropagation` on the card — so the
          way out was a lucky tap on the backdrop, and a long step could push the
          button off the bottom of an unscrollable panel. */}
      <Sheet
        visible={resetStep !== "hidden"}
        onClose={closeReset}
        title={
          resetStep === "email"
            ? "Reset your password"
            : resetStep === "otp"
              ? "Enter your code"
              : "Choose a new password"
        }
        subtitle={
          resetStep === "email"
            ? "We'll email you a 6-digit code."
            : resetStep === "otp"
              ? `Sent to ${resetEmail.trim()} — it expires in 15 minutes.`
              : "Code confirmed. Saving this signs you out everywhere else."
        }
        footer={
          <Press
            style={[styles.primary, !resetReady && styles.primaryOff]}
            disabled={!resetReady}
            onPress={runReset}
            haptic
            accessibilityLabel={resetLabel}
          >
            <Text style={[styles.primaryLabel, !resetReady && styles.primaryLabelOff]}>
              {resetLabel}
            </Text>
          </Press>
        }
      >
        <View style={styles.form}>
          <Text style={styles.step}>
            Step {resetStep === "email" ? 1 : resetStep === "otp" ? 2 : 3} of 3
          </Text>

          {resetStep === "email" && (
            <Field label="Email">
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.dim}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                autoFocus
              />
            </Field>
          )}

          {resetStep === "otp" && (
            <>
              <Field label="Your 6-digit code">
                <TextInput
                  value={resetOtp}
                  onChangeText={(t) => setResetOtp(t.replace(/\D/g, "").slice(0, 6))}
                  placeholder="——————"
                  placeholderTextColor={colors.dim}
                  style={[styles.input, styles.code]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                />
              </Field>
              <Press
                style={styles.link}
                disabled={resetBusy}
                onPress={resendReset}
                accessibilityLabel="Send another code"
              >
                {/* A JS string, so the apostrophe is a plain one — in JSX text it
                    would have to be &apos;. */}
                <Text style={styles.linkText}>{"Didn't get it? Send another code"}</Text>
              </Press>
            </>
          )}

          {resetStep === "password" && (
            <Field
              label="New password"
              hint={
                newPassword.length === 0
                  ? "At least 8 characters."
                  : newPassword.length < 8
                    ? `${8 - newPassword.length} more to go.`
                    : "Long enough."
              }
            >
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Choose a password"
                placeholderTextColor={colors.dim}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                autoFocus
              />
            </Field>
          )}

          {!!resetMsg && <Note text={resetMsg} />}
          {!!resetErr && <Note text={resetErr} bad />}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/**
 * A labelled field. The placeholder was doing the label's job, so the moment you
 * typed anything, nothing on screen said what the box had been asking for.
 */
function Field({
  label,
  hint,
  bad,
  children,
}: {
  label: string;
  hint?: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {!!hint && <Text style={[styles.hint, bad && styles.hintBad]}>{hint}</Text>}
    </View>
  );
}

/* The local `Note` that used to live here is now components/Note — the lesson
   page and the paywall needed the same shape, and both were throwing an OS
   Alert for it. */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 40, paddingBottom: 56 },
  mark: {
    alignSelf: "center",
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
    marginTop: 14,
  },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 5 },
  form: { gap: 12, marginTop: 22 },

  segmented: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 4,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: radius.pill,
  },
  segOn: { backgroundColor: colors.accentSoft },
  segLabel: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  segLabelOn: { color: colors.accent },

  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.2 },
  hint: { color: colors.dim, fontSize: 11 },
  hintBad: { color: colors.danger },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 16,
    minHeight: 48,
    fontSize: 14,
  },
  code: { letterSpacing: 8, fontWeight: "700", fontSize: 19, textAlign: "center" },
  pwWrap: { justifyContent: "center" },
  pwInput: { paddingRight: 52 },
  eye: {
    position: "absolute",
    right: 4,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },

  primary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    marginTop: 6,
  },
  /* Was `opacity: 0.4` on a live button, which reads as "loading" rather than
     "not yet". Press already dims a disabled control, so this only has to say
     which one it is. */
  primaryOff: { backgroundColor: colors.surfaceRaised },
  primaryLabel: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  primaryLabelOff: { color: colors.dim },

  link: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 40,
  },
  linkText: { color: colors.muted, fontSize: 12.5, fontWeight: "600" },

  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.dim, fontSize: 11 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },

  sentTo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  sentToText: { color: colors.text, fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  step: { color: colors.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },

  legal: { alignItems: "center", gap: 2, marginTop: 6 },
  legalText: { color: colors.dim, fontSize: 11 },
  legalRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  legalLink: { justifyContent: "center", minHeight: 34, paddingHorizontal: 6 },
  legalLinkText: { color: colors.muted, fontSize: 11.5, fontWeight: "700" },
});
