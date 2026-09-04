import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Press } from "./Press";
import { Text } from "./Type";
import { colors, elevation, radius } from "../lib/tokens";

/**
 * How it went.
 *
 * Three screens had three answers to this. The auth screen printed success and
 * failure in the same grey sentence; the lesson page and the paywall threw an OS
 * `Alert` — a dialog that has to be dismissed before the page can be touched
 * again, for news as small as "sent". One shape for all of it: green for done,
 * red for not, and the sentence stays where the button was.
 */
export function Note({
  text,
  bad,
  onDismiss,
  style,
}: {
  text: string;
  bad?: boolean;
  /** Adds a close button. Leave it off where the next action replaces the note. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.note, bad && styles.noteBad, style]} accessibilityLiveRegion="polite">
      <Ionicons
        name={bad ? "alert-circle" : "checkmark-circle"}
        size={15}
        color={bad ? colors.danger : colors.success}
      />
      <Text style={[styles.text, bad && styles.textBad]}>{text}</Text>
      {!!onDismiss && (
        <Press onPress={onDismiss} style={styles.close} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={14} color={colors.dim} />
        </Press>
      )}
    </View>
  );
}

/**
 * The same note, docked to the bottom of the screen rather than sitting in the
 * flow of it.
 *
 * For outcomes that arrive from anywhere on a long page — removing a course from
 * a list, deleting a post — where the reader may have scrolled far away from the
 * control they pressed. `pointerEvents="none"`, so it never eats a tap on what it
 * is floating over; `useToast` takes it away on a timer instead.
 */
export function Toast({ note }: { note: { text: string; bad?: boolean } | null }) {
  const insets = useSafeAreaInsets();
  if (!note) return null;
  return (
    <View style={[styles.toast, { bottom: Math.max(20, insets.bottom + 14) }]} pointerEvents="none">
      <Note text={note.text} bad={note.bad} />
    </View>
  );
}

/**
 * The state behind a `Toast`: `say("Saved")`, or `say("That didn't work", true)`.
 *
 * The timer is cleared on the next call and on unmount — the screens that grew
 * this pattern by hand each left a bare `setTimeout` running, which fires into a
 * dead component if you leave the page while a toast is up.
 */
export function useToast(): { note: { text: string; bad?: boolean } | null; say: (text: string, bad?: boolean) => void } {
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, bad = false) => {
    setNote({ text, bad });
    if (timer.current) clearTimeout(timer.current);
    // Failures stay up longer: they are usually a sentence, not a word.
    timer.current = setTimeout(() => setNote(null), bad ? 4000 : 2200);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { note, say };
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    // Two lines of text against a 15px icon: top-aligned, or the icon floats to
    // the middle of the paragraph.
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successLine,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  // minWidth alongside flex, or a long unbroken URL in an error message pushes
  // the close button off the end of the row.
  text: { color: colors.success, fontSize: 12.5, lineHeight: 18, flex: 1, minWidth: 0 },
  textBad: { color: colors.danger },
  close: { padding: 2 },
  // The note's own fill is translucent, which over a poster reads as a smudge —
  // so the dock is opaque and lifted, and the tint sits on top of that.
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    ...elevation[3],
  },
});
