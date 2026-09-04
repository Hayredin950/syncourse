import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DMMono_400Regular, DMMono_500Medium } from "@expo-google-fonts/dm-mono";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import LegalConsent from "../components/LegalConsent";
import UpdateBanner from "../components/UpdateBanner";
import { AuthProvider } from "../lib/auth";
import { colors, fonts } from "../lib/tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Global scope on purpose: called from inside a component it can fire after the
// splash screen has already gone.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 320, fade: true });

export default function RootLayout() {
  // The web app is set in Manrope; this one was set in whatever the OS supplied,
  // which is the loudest single reason the two read as different products.
  const [fontsReady, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    // A font that fails to load must not hold the app hostage — the fallback is
    // the system face, which is survivable. A blank screen is not.
    if (fontsReady || fontError) SplashScreen.hide();
  }, [fontsReady, fontError]);

  if (!fontsReady && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              // Native header text is outside React, so it needs the family
              // named here — the <Text> wrapper cannot reach it.
              headerTitleStyle: { fontFamily: fonts.w700, fontSize: 17 },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="courses/[slug]" options={{ title: "", headerBackTitle: "Back" }} />
            <Stack.Screen name="courses/[slug]/lessons/[lessonId]" options={{ title: "Lesson" }} />
            <Stack.Screen name="auth" options={{ title: "Account" }} />
            <Stack.Screen name="premium" options={{ title: "Premium" }} />
            <Stack.Screen name="lists/index" options={{ title: "Collections" }} />
            <Stack.Screen name="lists/[id]" options={{ title: "Collection" }} />
            <Stack.Screen name="resources/index" options={{ title: "Resources" }} />
            {/* The hero carries the title, so a duplicate in the bar is noise. */}
            <Stack.Screen name="resources/[slug]" options={{ title: "", headerBackTitle: "Back" }} />
            <Stack.Screen name="circles" options={{ title: "Circles" }} />
            <Stack.Screen name="lecturers/index" options={{ title: "Lecturers" }} />
            {/* Every screen below used to fall through to expo-router's default,
                which is the route path — two of them put the literal text
                "lecturers/[slug]" in the header bar. The detail screens set the
                real name once the row arrives; these are what shows first. */}
            <Stack.Screen name="lecturers/[slug]" options={{ title: "Lecturer", headerBackTitle: "Back" }} />
            <Stack.Screen name="organizations/index" options={{ title: "Channels & Schools" }} />
            <Stack.Screen name="organizations/[slug]" options={{ title: "Channel", headerBackTitle: "Back" }} />
            <Stack.Screen name="paths/index" options={{ title: "Learning paths" }} />
            <Stack.Screen name="paths/[id]" options={{ title: "Learning path" }} />
            <Stack.Screen name="legal/[type]" options={{ title: "Legal" }} />
            <Stack.Screen name="downloads" options={{ title: "Downloads" }} />
            <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
            <Stack.Screen name="stats" options={{ title: "Your stats" }} />
            <Stack.Screen name="changelog" options={{ title: "What's new" }} />
          </Stack>
          <UpdateBanner />
          <LegalConsent />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
