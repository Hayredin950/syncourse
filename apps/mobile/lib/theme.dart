import 'package:flutter/material.dart';

/// Mirrors packages/design-tokens — near-black bg, elevated surfaces,
/// amber accent for every primary CTA and the stars.
class AppTheme {
  static ThemeData get dark => buildTheme();
}

class AppColors {
  static const bg = Color(0xFF0E0E10);
  static const surface = Color(0xFF1A1A1D);
  static const surfaceHover = Color(0xFF232327);
  static const surfaceRaised = Color(0xFF26262B);
  static const border = Color(0xFF2E2E34);
  static const text = Color(0xFFF4F4F5);
  static const muted = Color(0xFF9E9EA7);
  static const dim = Color(0xFF6B6B73);
  static const accent = Color(0xFFF5A524);
  static const accentHover = Color(0xFFFFB93C);
  static const danger = Color(0xFFE5484D);
  static const success = Color(0xFF30A46C);
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.accent,
      secondary: AppColors.accent,
      surface: AppColors.surface,
      error: AppColors.danger,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.bg,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.text,
        fontSize: 18,
        fontWeight: FontWeight.bold,
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.surface,
      selectedItemColor: AppColors.accent,
      unselectedItemColor: AppColors.dim,
      type: BottomNavigationBarType.fixed,
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.accent,
      labelStyle: const TextStyle(color: AppColors.text, fontSize: 12),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.black,
        textStyle: const TextStyle(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      hintStyle: const TextStyle(color: AppColors.dim),
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
  );
}
