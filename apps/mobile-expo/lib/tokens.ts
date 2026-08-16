// Mirrors packages/design-tokens — single source: near-black bg, amber accent.
export const colors = {
  bg: "#0E0E10",
  surface: "#1A1A1D",
  surfaceHover: "#232327",
  surfaceRaised: "#26262B",
  border: "#2E2E34",
  text: "#F4F4F5",
  muted: "#9E9EA7",
  dim: "#6B6B73",
  accent: "#F5A524",
  accentHover: "#FFB93C",
  accentSoft: "rgba(245,165,36,0.15)",
  danger: "#E5484D",
  success: "#30A46C",
  star: "#F5A524",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
