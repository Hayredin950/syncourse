import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/tokens";

export default function AuthScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") await api.register(name, email, password);
      else await api.login(email, password);
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>🎓</Text>
        <Text style={styles.title}>SynCourse</Text>
        <Text style={styles.subtitle}>One account across web, app and Telegram</Text>

        {mode === "register" && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.dim}
            style={styles.input}
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
        <Text
          style={styles.switch}
          onPress={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </Text>
        <Text style={styles.google} onPress={() => setError("Google sign-in: set GOOGLE_CLIENT_ID and it appears here")}>
          Continue with Google
        </Text>
      </ScrollView>
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
});
