import React from "react";
import { StyleSheet, View } from "react-native";
import { Note } from "./Note";
import { Press } from "./Press";
import { Sheet } from "./Sheet";
import { Text } from "./Type";
import { colors, radius } from "../lib/tokens";

/**
 * "Are you sure?" for the handful of actions that cannot be undone.
 *
 * Every one of these was an `Alert.alert(title, body, [Cancel, Delete])`. Two
 * problems with that: react-native-web ships `Alert` as `static alert() {}` — an
 * empty function — so in the browser build the delete button on a circle, a post,
 * a member and a list did *nothing at all*; and on native the OS dialog is the one
 * surface in the app that doesn't look like the app.
 *
 * The confirm button is an outline in `danger`, not a filled red slab: filled
 * `#E5484D` can't carry 13px white type at AA contrast, and the outline matches
 * the destructive buttons already on the settings screen.
 */
export function Confirm({
  visible,
  onClose,
  title,
  body,
  confirmLabel = "Delete",
  pendingLabel = "Working…",
  onConfirm,
  pending,
  error,
  destructive = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Shown in place of `confirmLabel` while the mutation is in flight. */
  pendingLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  /** A refusal from the server. Keep the sheet open and it lands here — the last
      thing the reader touched is the right place for the reason. */
  error?: unknown;
  /** Off for a confirm that isn't a deletion — the button goes amber instead. */
  destructive?: boolean;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      scroll={false}
      footer={
        <View style={styles.actions}>
          <Press style={styles.cancel} onPress={onClose} accessibilityLabel="Cancel">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Press>
          <Press
            style={[styles.go, destructive ? styles.goBad : styles.goOk]}
            onPress={onConfirm}
            disabled={pending}
            haptic={destructive ? "warning" : "success"}
            accessibilityLabel={confirmLabel}
          >
            <Text style={[styles.goLabel, destructive ? styles.goLabelBad : styles.goLabelOk]}>
              {pending ? pendingLabel : confirmLabel}
            </Text>
          </Press>
        </View>
      }
    >
      {!!body && <Text style={styles.body}>{body}</Text>}
      {!!error && (
        <Note
          bad
          text={(error instanceof Error && error.message) || "That didn't work. Try again."}
          style={styles.err}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.body, fontSize: 13.5, lineHeight: 20, paddingBottom: 4 },
  err: { marginTop: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  cancel: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  // The destructive option takes the wide half: it is what the sheet is for, and
  // Cancel is also the backdrop, the close button and the back gesture.
  go: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  goBad: { borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  goOk: { borderColor: colors.accent, backgroundColor: colors.accent },
  goLabel: { fontSize: 13.5, fontWeight: "800" },
  goLabelBad: { color: colors.danger },
  goLabelOk: { color: colors.onAccent },
});
