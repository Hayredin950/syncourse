import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { colors, fonts } from "../../lib/tokens";

/** The five tabs. Active tabs take the filled glyph, inactive the outline —
 *  which is how a phone signals "you are here" without relying on colour. */
const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  index: ["home", "home-outline"],
  browse: ["grid", "grid-outline"],
  search: ["search", "search-outline"],
  learning: ["library", "library-outline"],
  me: ["person", "person-outline"],
};

const TITLES: Record<string, string> = {
  index: "Home",
  browse: "Browse",
  search: "Search",
  learning: "Library",
  me: "Me",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.w700, fontSize: 17 },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: { fontFamily: fonts.w600, fontSize: 11 },
        tabBarItemStyle: { paddingTop: 4 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {Object.keys(ICONS).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: TITLES[name],
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={ICONS[name][focused ? 0 : 1]} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

