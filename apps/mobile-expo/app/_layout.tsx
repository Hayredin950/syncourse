import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../lib/auth";
import { colors } from "../lib/tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: "700" },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="courses/[slug]" options={{ title: "", headerBackTitle: "Back" }} />
            <Stack.Screen name="courses/[slug]/lessons/[lessonId]" options={{ title: "Lesson" }} />
            <Stack.Screen name="auth" options={{ title: "Account" }} />
            <Stack.Screen name="premium" options={{ title: "Premium" }} />
            <Stack.Screen name="lists/[id]" options={{ title: "List" }} />
            <Stack.Screen name="circles" options={{ title: "Circles" }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
