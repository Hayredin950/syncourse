import 'package:flutter/material.dart';

/// Mirrors the web design tokens in `apps/web/src/app/globals.css`: the warm
/// near-black ramp, the amber "ring" accent and the six-rung ink ladder.
class AppTheme {
  static ThemeData get dark => buildTheme();
}

/// The web's `@media (max-width: 760px)` boundary: below it the phone layout
/// (mobile header, floating tab bar) is used; at or above it the desktop shell
/// (top bar, 1240px page) takes over.
const kDesktopBreakpoint = 760.0;

/// The web's `.page { width: min(1240px, 91vw) }` ceiling.
const kPageMaxWidth = 1240.0;

class AppColors {
  static const bg = Color(0xFF0E0E0D);
  static const surface = Color(0xFF161513);
  static const surfaceSunk = Color(0xFF121110);
  static const surfaceRaised = Color(0xFF201E1B);
  static const surfaceHover = Color(0xFF2A2723);
  static const border = Color(0xFF2E2A26);
  static const hairline = Color(0x1AFFFFFF);
  static const text = Color(0xFFF5F2EA);
  static const ink1 = Color(0xFFE9E3D7);
  static const ink2 = Color(0xFFDDD6C9);
  static const ink3 = Color(0xFFCEC6B8);
  static const ink4 = Color(0xFFB8AFA4);
  static const ink5 = Color(0xFF948B80);
  static const muted = Color(0xFFB8AFA4);
  static const dim = Color(0xFF948B80);
  static const accent = Color(0xFFE8A13A);
  static const accentHover = Color(0xFFF3B45B);
  static const accentSoft = Color(0x24E8A13A);
  static const danger = Color(0xFFC4503A);
  static const success = Color(0xFF30A46C);
  static const premium = Color(0xFFE8A13A);
}

/// A deterministic hue for a course that has no cover yet — the same trick the
/// web `CoverArt` uses, so a slow or blocked thumbnail leaves a branded plate
/// behind rather than a flat grey hole.
int hueFromString(String s) {
  var h = 0;
  for (final unit in s.codeUnits) {
    h = (h * 31 + unit) % 360;
  }
  return h;
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final textTheme = base.textTheme.apply(
    bodyColor: AppColors.text,
    displayColor: AppColors.text,
  );
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    canvasColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.accent,
      onPrimary: const Color(0xFF161310),
      secondary: AppColors.accent,
      surface: AppColors.surface,
      onSurface: AppColors.text,
      error: AppColors.danger,
    ),
    textTheme: textTheme.copyWith(
      headlineSmall: textTheme.headlineSmall?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
        color: AppColors.text,
      ),
      titleLarge: textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
        color: AppColors.text,
      ),
      titleMedium: textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w700,
        color: AppColors.text,
      ),
      bodyMedium: textTheme.bodyMedium?.copyWith(color: AppColors.ink3),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.text,
        fontSize: 22,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.border,
      thickness: 1,
      space: 1,
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.accent,
      labelStyle: const TextStyle(color: AppColors.ink2, fontSize: 12),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: const Color(0xFF161310),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text,
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.accent),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceSunk,
      hintStyle: const TextStyle(color: AppColors.dim, fontSize: 13),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: AppColors.accent),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: AppColors.surfaceRaised,
      contentTextStyle: TextStyle(color: AppColors.text, fontSize: 13),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
