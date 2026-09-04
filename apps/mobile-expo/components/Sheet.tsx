import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Press } from "./Press";
import { Text } from "./Type";
import { colors, elevation, radius } from "../lib/tokens";

/**
 * One bottom sheet for the whole app.
 *
 * Seven screens each rolled their own — the same Modal, the same backdrop, the
 * same rounded panel — and every one of them differed in a way that mattered:
 * a hard-coded `paddingBottom: 34` or `40` that sits under the gesture bar now
 * that Android edge-to-edge is mandatory in SDK 57; a `maxHeight: "85%"` with no
 * scroll view inside, so a long filter list simply could not be reached; no
 * close button, so the only way out was a lucky tap on the backdrop; and nothing
 * telling a screen reader it had entered a dialog.
 *
 * `statusBarTranslucent`/`navigationBarTranslucent` matter for the same reason:
 * without them the modal's own window stops at the system bars and the backdrop
 * ends in a visible seam.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = "88%",
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned below the scrolling body — a Save or Done button belongs here. */
  footer?: React.ReactNode;
  maxHeight?: DimensionValue;
  /** Off when the body is its own FlatList, which must not nest in a ScrollView. */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = Math.max(16, insets.bottom + 12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      {/* Four of these sheets hold a text field — a list name, a Telebirr payment
          reference — and a sheet is docked to the bottom edge, which is exactly
          where the keyboard opens. Android resizes the window for us; iOS does
          not, so without this the field is behind the keyboard. */}
      <KeyboardAvoidingView
        style={styles.dock}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <View
          style={[styles.sheet, { maxHeight }]}
          accessibilityViewIsModal
          accessibilityRole="none"
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              )}
            </View>
            <Press style={styles.close} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={19} color={colors.text} />
            </Press>
          </View>

          {scroll ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={[styles.body, !footer && { paddingBottom: pad }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyFlex, !footer && { paddingBottom: pad }]}>{children}</View>
          )}

          {!!footer && <View style={[styles.footer, { paddingBottom: pad }]}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: "rgba(6,5,4,0.66)" },
  dock: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation[3],
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  bodyScroll: { flexGrow: 0 },
  body: { paddingHorizontal: 20 },
  bodyFlex: { flexShrink: 1, paddingHorizontal: 20 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
