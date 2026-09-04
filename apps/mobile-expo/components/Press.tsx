import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from "react-native";

/**
 * A pressable that reacts to being pressed.
 *
 * Nearly twelve thousand lines of app and not one tap had any feedback: rows,
 * cards and icon buttons all sat completely inert under a finger, so the only
 * way to know a tap had registered was to wait for the next screen. That reads
 * as a slow app even when the app is fast.
 *
 * Press dims and settles by 1% — enough to feel, not enough to look like a
 * bounce — and grows the touch target to the 44pt minimum by default. Actions
 * that commit something (rating, saving, deleting) pass `haptic` and get a tick
 * from the vibration motor; navigation does not, because a buzz on every tap
 * stops meaning anything.
 */
export function Press({
  style,
  onPress,
  haptic,
  disabled,
  children,
  hitSlop = 6,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Fire a short tick on press. For actions that change state, not for links. */
  haptic?: boolean | "success" | "warning";
}) {
  const handle = useCallback(
    (e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) => {
      if (haptic) {
        if (haptic === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else if (haptic === "warning") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress?.(e);
    },
    [haptic, onPress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={handle}
      style={({ pressed }) => [style, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.62, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
});
