import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from "react-native";
import * as api from "../../lib/api";
import { cloudinaryUrl } from "../../lib/cloudinary";
import { colors, radius } from "../../lib/tokens";

export default function PathsIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["learning-paths"],
    queryFn: api.learningPaths,
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
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Featured learning paths</Text>
          <Text style={styles.subtitle}>{data?.length ?? 0} paths</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/paths/${item.id}`} asChild>
          <View style={styles.card}>
            <View style={styles.strip}>
              {(item.courses ?? []).slice(0, 4).map((c, i) =>
                c.thumbnailUrl ? (
                  <Image
                    key={i}
                    source={{ uri: cloudinaryUrl(c.thumbnailUrl, { width: 140, height: 90 }) ?? undefined }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View key={i} style={[styles.thumb, styles.thumbFallback]} />
                ),
              )}
            </View>
            <Text style={styles.eyebrow}>LEARNING PATH</Text>
            <Text style={styles.name} numberOfLines={1}>{item.title}</Text>
            {!!item.description && (
              <Text style={styles.muted} numberOfLines={2}>{item.description}</Text>
            )}
            <Text style={styles.meta}>
              ★ {item.ratingAvg.toFixed(1)} · {item.courseCount} courses · {item.totalVotes.toLocaleString()} votes
            </Text>
          </View>
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  strip: { flexDirection: "row", gap: 6, marginBottom: 10 },
  thumb: { width: 64, height: 40, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  name: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 6 },
});
