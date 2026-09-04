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

export default function OrganizationsIndex() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations,
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
    return <Failed title="Could not load the publishers" onRetry={() => refetch()} />;
  }

  const orgs = data ?? [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      data={orgs}
      keyExtractor={(o) => o.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>Channels & schools</Text>
          <Text style={styles.subtitle}>
            {orgs.length === 0 ? "Everyone publishing on Syncourse" : plural(orgs.length, "publisher")}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Empty
          icon="business-outline"
          title="No publishers yet"
          body="Channels and schools appear here as soon as their first course is live."
        />
      }
      renderItem={({ item }) => {
        const logo = cloudinaryUrl(item.logoUrl, { width: 96, height: 96 });
        const meta = `${plural(item.subscribers ?? 0, "subscriber")} · ${plural(item.courseCount ?? 0, "course")}`;
        return (
          <Press
            style={styles.card}
            onPress={() => router.push(`/organizations/${item.slug}`)}
            accessibilityLabel={`${item.name}. ${meta}`}
          >
            <View style={styles.logo}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.logoImg} resizeMode="cover" />
              ) : (
                <Text style={styles.initial}>{item.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {!!item.description && (
                <Text style={styles.muted} numberOfLines={1}>
                  {item.description}
                </Text>
              )}
              <Text style={styles.muted}>{meta}</Text>
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
  logo: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: "100%", height: "100%" },
  initial: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 11.5 },
});
