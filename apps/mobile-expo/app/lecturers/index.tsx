import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { Empty, Failed } from "../../components/Empty";
import { Press } from "../../components/Press";
import { SkRows } from "../../components/Skeleton";
import { Text } from "../../components/Type";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";
import { plural } from "../../lib/types";

export default function LecturersIndex() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["lecturers"],
    queryFn: api.lecturers,
  });
  const { width } = useWindowDimensions();
  const gutter = Math.max(16, Math.round((width - 720) / 2));

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <SkRows n={7} thumb={48} />
      </View>
    );
  }
  if (error) {
    return <Failed title="Could not load the lecturers" onRetry={() => refetch()} />;
  }

  const lecturers = data ?? [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      data={lecturers}
      keyExtractor={(l) => l.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>Lecturers</Text>
          <Text style={styles.subtitle}>
            {lecturers.length === 0 ? "Everyone who teaches on Syncourse" : plural(lecturers.length, "instructor")}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Empty
          icon="people-outline"
          title="No lecturers yet"
          body="Every course credits whoever taught it, so this fills up as the catalogue grows."
        />
      }
      renderItem={({ item }) => {
        const photo = cloudinaryUrl(item.photoUrl, { width: 96, height: 96 });
        return (
          <Press
            style={styles.card}
            onPress={() => router.push(`/lecturers/${item.slug}`)}
            accessibilityLabel={`${item.name}, ${plural(item.courseCount ?? 0, "course")}`}
          >
            <View style={styles.avatar}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImg} resizeMode="cover" />
              ) : (
                <Text style={styles.initial}>{item.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {!!item.credentials && (
                <Text style={styles.muted} numberOfLines={1}>
                  {item.credentials}
                </Text>
              )}
              <Text style={styles.muted}>{plural(item.courseCount ?? 0, "course")}</Text>
            </View>
            {/* Was a "›" glyph at 20px, which sits on a different baseline per OS. */}
            <Ionicons name="chevron-forward" size={17} color={colors.dim} />
          </Press>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingVertical: 16, gap: 10, paddingBottom: 40, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  head: { marginBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12.5, marginTop: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  initial: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 11.5 },
});
