// Mirrors the approved UI/UX replica — warm near-black surfaces + amber primary (phonofilm layout patterns, Syncourse branding).
export const colors = {
  bg: "#0E0D0B",
  surface: "#171512",
  surfaceHover: "#232019",
  surfaceRaised: "#221F1A",
  border: "#3A332B",
  text: "#F1EADD",
  muted: "#A49A8D",
  dim: "#7A7166",
  /**
   * Long-form body copy — a paragraph, a review, a release note.
   *
   * Ten style rules across five screens set this by hand as
   * `rgba(244,244,245,0.7)`, which is zinc: a cool grey left over from an
   * earlier palette. Against warm near-black surfaces and `#F1EADD` headings
   * every paragraph in the app read faintly blue next to its own title.
   */
  body: "rgba(241,234,221,0.78)",
  accent: "#F39027",
  accentHover: "#FFA94D",
  accentSoft: "rgba(243,143,39,0.15)",
  /**
   * Ink for type and glyphs sitting on a filled `accent` surface.
   *
   * 55 style rules and JSX props across 23 files spelled this out as `#211308`,
   * and every one of them had been `#000` before that — pure black on this amber
   * reads as a hole punched in the pill rather than a label on it. It is the one
   * ink in the app that is not `text`, so it belongs in the palette beside the
   * colour it sits on, not copied into every file that fills a button.
   */
  onAccent: "#211308",
  /** The same idea for the mint `success` fill. */
  onSuccess: "#10231A",
  danger: "#E5484D",
  /**
   * A destructive control: 1px `dangerLine` around a `dangerSoft` fill, label in
   * `danger`. Never a filled `#E5484D` slab — it cannot carry 13px type at AA.
   */
  dangerSoft: "rgba(229,72,77,0.12)",
  dangerLine: "rgba(229,72,77,0.45)",
  success: "#6FE0A4",
  successSoft: "rgba(111,224,164,0.10)",
  successLine: "rgba(111,224,164,0.35)",
  /** Over a poster: dark enough to carry `text` at AA on any image beneath it. */
  scrim: "rgba(0,0,0,0.6)",
  star: "#FFC06E",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Type. The web app is set in Manrope with DM Mono for numbers; this app was on
 * whatever the OS supplied, which is the single loudest thing that made the two
 * look like different products.
 *
 * React Native cannot synthesise a weight from a custom font — asking for
 * `fontWeight: "800"` on Android gets you a smeared fake bold — so each weight
 * is a separate registered family and `fontFor` picks the right one. Nothing
 * calls this directly: `components/Type` reads the weight off the style you
 * already wrote and swaps the family in, so the 259 `fontWeight` declarations
 * across the app keep working untouched.
 */
export const fonts = {
  w400: "Manrope_400Regular",
  w500: "Manrope_500Medium",
  w600: "Manrope_600SemiBold",
  w700: "Manrope_700Bold",
  w800: "Manrope_800ExtraBold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
} as const;

export function fontFor(weight?: string | number): string {
  const w = typeof weight === "number" ? weight : parseInt(weight ?? "400", 10);
  if (weight === "bold") return fonts.w700;
  if (!w || w <= 400) return fonts.w400;
  if (w <= 500) return fonts.w500;
  if (w <= 600) return fonts.w600;
  if (w <= 700) return fonts.w700;
  return fonts.w800;
}

/**
 * Shadows. Android reads `elevation`, iOS reads the four `shadow*` props, and a
 * card that sets only one of the two is flat on the other platform — which was
 * every card here.
 */
export const elevation = {
  1: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  2: { elevation: 5, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 11, shadowOffset: { width: 0, height: 5 } },
  3: { elevation: 10, shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
} as const;

