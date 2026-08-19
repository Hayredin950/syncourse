import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View, Pressable } from "react-native";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";

export default function LecturersIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["lecturers"],
    queryFn: api.lecturers,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data ?? []}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Lecturers</Text>
          <Text style={styles.subtitle}>{data?.length ?? 0} instructors</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/lecturers/${item.slug}`} asChild>
          <Pressable style={styles.card}>
            <View style={styles.avatar}>
              {item.photoUrl ? (
                <Image
                  source={{ uri: cloudinaryUrl(item.photoUrl, { width: 96, height: 96 }) ?? undefined }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.initial}>{item.name.charAt(0)}</Text>
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {!!item.credentials && (
                <Text style={styles.muted} numberOfLines={1}>{item.credentials}</Text>
              )}
              <Text style={styles.muted}>{item.courseCount ?? 0} courses</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, marginBottom: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  initial: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  cardBody: { flex: 1 },
  name: { color: colors.text, fontSize: 14, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 11, marginTop: 1 },
  chevron: { color: colors.dim, fontSize: 20 },
});
