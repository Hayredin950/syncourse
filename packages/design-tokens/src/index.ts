/**
 * Syncourse design tokens — mirrors the reference app's dark theme.
 * Consumed by the Next.js Tailwind config and (via mirrored theme.dart) Flutter.
 *
 * Theme: near-black background, elevated surfaces, one warm amber accent
 * for every primary CTA and the rating stars. Rounded 12-16px cards, 2:3
 * poster ratio for grids, pill-shaped chips, 4-item bottom nav.
 */
export const colors = {
  bg: "#0E0E10",
  surface: "#1A1A1D",
  surfaceHover: "#232327",
  surfaceRaised: "#26262B",
  border: "#2E2E34",
  text: "#F4F4F5",
  textMuted: "#9E9EA7",
  textDim: "#6B6B73",
  accent: "#F5A524", // amber — primary CTA + stars
  accentHover: "#FFB93C",
  accentSoft: "rgba(245,165,36,0.15)",
  danger: "#E5484D",
  success: "#30A46C",
  star: "#F5A524",
  badgeAdded: "#30A46C",
  badgeBest: "#F5A524",
} as const;

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  pill: "999px",
} as const;

export const fontSize = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "22px",
  "2xl": "28px",
  "3xl": "36px",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const posterRatio = "2 / 3" as const;
export const bannerRatio = "16 / 9" as const;
export const contentColumn = "420px" as const; // mobile-first max content width

export const navTabs = ["Home", "Search", "My Learning", "Me"] as const;

export const designTokens = { colors, spacing, radius, fontSize, fontWeight, posterRatio, bannerRatio, contentColumn, navTabs };

export default designTokens;
