import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ResourceLibrary } from "../../components/ResourceLibrary";

/**
 * `/resources` — the same shelf the Browse tab shows, reached directly.
 *
 * The library itself moved into a component so it could live inside Browse
 * without the bottom bar disappearing. This route stays for the links that
 * already point at it: a notification deep link, a shared URL, or
 * `/resources?type=roadmap` from anywhere else in the app.
 */
export default function ResourcesScreen() {
  const params = useLocalSearchParams<{ type?: string; category?: string; tag?: string }>();
  return (
    <ResourceLibrary
      initialType={params.type}
      initialCategory={params.category}
      initialTag={params.tag}
    />
  );
}
