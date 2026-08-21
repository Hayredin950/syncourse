import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/tokens";

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

export default function AuthScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  // email verification (hard verify: sign-in blocked until confirmed)
  const [verifying, setVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  const startGoogle = async () => {
    setError(null);
    setBusy(true);
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
      setBusy(false);
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
  };

  const closeReset = () => {
    setResetStep("hidden");
    setResetOtp("");
    setNewPassword("");
    setResetToken("");
    setResetErr(null);
  };

  /** Step 1 — ask for a code. */
  const requestReset = async () => {
    if (!resetEmail.trim()) return;
    setResetBusy(true);
    setResetErr(null);
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
    try {
      await api.forgotPassword(resetEmail.trim());
      setResetOtp("");
      Alert.alert("Code sent", "A new code is on its way — check your inbox (and spam).");
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "Could not resend the code");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>🎓</Text>
        <Text style={styles.title}>Syncourse</Text>
        <Text style={styles.subtitle}>
          {verifying ? "Check your email" : "One account across web, app and Telegram"}
        </Text>

        {verifying ? (
          <>
            <Text style={styles.muted}>{verifyEmail}</Text>
            <TextInput
              value={verifyCode}
              onChangeText={(t) => setVerifyCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              placeholderTextColor={colors.dim}
              style={[styles.input, { letterSpacing: 6, fontWeight: "700", fontSize: 18, textAlign: "center" }]}
              keyboardType="number-pad"
              autoFocus
            />
            {verifyMsg && <Text style={[styles.muted, { color: "#6fe0a4" }]}>{verifyMsg}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}
            <Text
              style={[styles.submitBtn, (busy || verifyCode.length !== 6) && { opacity: 0.4 }]}
              onPress={busy || verifyCode.length !== 6 ? undefined : confirmCode}
            >
              {busy ? "Checking…" : "Verify & sign in"}
            </Text>
            <Text style={styles.forgot} onPress={resendBusy ? undefined : resendCode}>
              {resendBusy ? "Sending…" : "Didn't get it? Resend the code"}
            </Text>
            <Text
              style={styles.switch}
              onPress={() => {
                setVerifying(false);
                setError(null);
                setVerifyMsg(null);
              }}
            >
              Back to sign in
            </Text>
          </>
        ) : (
          <>
        {mode === "register" && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        )}
        {mode === "register" && (
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Username (letters, numbers, _)"
            placeholderTextColor={colors.dim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.dim}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 8 chars)"
          placeholderTextColor={colors.dim}
          style={styles.input}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.submitBtn} onPress={busy ? undefined : submit}>
          {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
        </Text>
        {mode === "login" && (
          <Text style={styles.forgot} onPress={openReset}>
            Forgot password?
          </Text>
        )}
        <Text
          style={styles.switch}
          onPress={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </Text>
        <Text style={styles.google} onPress={busy ? undefined : startGoogle}>
          {busy ? "Signing in…" : "Continue with Google"}
        </Text>
        </>
        )}
      </ScrollView>

      <Modal visible={resetStep !== "hidden"} transparent animationType="fade" onRequestClose={closeReset}>
        <Pressable style={styles.forgotBackdrop} onPress={closeReset}>
          <Pressable style={styles.forgotCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.forgotTitle}>
              {resetStep === "email"
                ? "Reset your password"
                : resetStep === "otp"
                  ? "Enter your code"
                  : "Choose a new password"}
            </Text>

            {resetStep === "email" && (
              <>
                <Text style={styles.muted}>We&apos;ll email you a 6-digit code.</Text>
                <TextInput
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.dim}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
                <Pressable
                  style={[styles.forgotBtn, (!resetEmail.trim() || resetBusy) && { opacity: 0.4 }]}
                  disabled={!resetEmail.trim() || resetBusy}
                  onPress={requestReset}
                >
                  <Text style={styles.forgotBtnLabel}>{resetBusy ? "…" : "Send code"}</Text>
                </Pressable>
              </>
            )}

            {resetStep === "otp" && (
              <>
                <Text style={styles.muted}>Sent to {resetEmail.trim()} — expires in 15 minutes.</Text>
                <TextInput
                  value={resetOtp}
                  onChangeText={(t) => setResetOtp(t.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.dim}
                  style={[styles.input, { letterSpacing: 6, fontWeight: "700", fontSize: 18, textAlign: "center" }]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                />
                <Pressable
                  style={[styles.forgotBtn, (resetOtp.length !== 6 || resetBusy) && { opacity: 0.4 }]}
                  disabled={resetOtp.length !== 6 || resetBusy}
                  onPress={verifyResetOtp}
                >
                  <Text style={styles.forgotBtnLabel}>{resetBusy ? "…" : "Continue"}</Text>
                </Pressable>
                <Text style={styles.forgot} onPress={resetBusy ? undefined : resendReset}>
                  {/* plain apostrophe: this is a JS string, not JSX text — &apos; would render literally */}
                  Didn't get it? Send another code
                </Text>
              </>
            )}

            {resetStep === "password" && (
              <>
                <Text style={styles.muted}>Code confirmed. This signs you out everywhere else.</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password (min 8 chars)"
                  placeholderTextColor={colors.dim}
                  style={styles.input}
                  secureTextEntry
                  autoComplete="new-password"
                  autoFocus
                />
                <Pressable
                  style={[styles.forgotBtn, (newPassword.length < 8 || resetBusy) && { opacity: 0.4 }]}
                  disabled={newPassword.length < 8 || resetBusy}
                  onPress={saveNewPassword}
                >
                  <Text style={styles.forgotBtnLabel}>{resetBusy ? "…" : "Save password"}</Text>
                </Pressable>
              </>
            )}

            {resetErr && <Text style={styles.error}>{resetErr}</Text>}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 48, gap: 12 },
  logo: { fontSize: 56, textAlign: "center" },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", textAlign: "center", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: "center", marginBottom: 12 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
  },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  submitBtn: {
    backgroundColor: colors.accent,
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 6,
  },
  switch: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 4 },
  google: { color: colors.text, fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: 8 },
  forgot: { color: colors.muted, fontSize: 12, textAlign: "center", textDecorationLine: "underline", marginTop: 2 },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
  forgotBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  forgotCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  forgotTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  forgotBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  forgotBtnLabel: { color: "#000", fontWeight: "800", fontSize: 14 },
});
