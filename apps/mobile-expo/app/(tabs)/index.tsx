import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Rail } from "../../components/Rail";
import * as api from "../../lib/api";
import { colors } from "../../lib/tokens";

export default function HomeScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["home"],
    queryFn: api.home,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not reach the server</Text>
        <Link href="/auth" style={styles.retry}>
          Retry
        </Link>
      </View>
    );
  }

  const feed = data!;
  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
      }
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>SynCourse</Text>
      <Rail title="🔥 Trending" courses={feed.trending} href="/browse" />
      <Rail title="✨ Latest" courses={feed.latest} href="/browse" />
      <Rail title="⭐ Top rated" courses={feed.topRated} href="/browse" />
      {feed.rails.map((rail) => (
        <Rail key={rail.slug || rail.title} title={rail.title} courses={rail.courses} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 12, paddingBottom: 32 },
  logo: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: { color: colors.muted, fontSize: 14 },
  retry: { color: colors.accent, fontWeight: "700" },
});
