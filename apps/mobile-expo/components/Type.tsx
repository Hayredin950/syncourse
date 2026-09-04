import React from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { fontFor, fonts } from "../lib/tokens";

/**
 * Text and TextInput, in the app's typeface.
 *
 * Every screen wrote `fontWeight: "800"` and got the system font, because React
 * Native only honours a weight if a family is registered under it — and 259
 * declarations is too many to rewrite by hand and too many to keep in sync
 * afterwards. So these two read the weight off the style you already wrote and
 * substitute the matching Manrope face. Existing StyleSheets are untouched.
 *
 * The weight is then dropped rather than passed along: the face is already
 * ExtraBold, and leaving `800` on top of it asks Android for a synthetic bold of
 * a bold, which comes out thick and slightly smeared.
 *
 * A style may still name a family explicitly and win — `fontFamily: "monospace"`
 * is remapped to DM Mono so figures line up in a column the way they do on the
 * web.
 */
function withFace(style: TextStyle | undefined): TextStyle | undefined {
  const named = style?.fontFamily;
  if (named && named !== "monospace" && named !== "Courier" && named !== "Courier New") {
    return style; // an explicit family the caller meant
  }
  const out: TextStyle = { ...style };
  out.fontFamily = named ? (style?.fontWeight ? fonts.monoMedium : fonts.mono) : fontFor(style?.fontWeight);
  delete out.fontWeight;
  return out;
}

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={withFace(StyleSheet.flatten(style) as TextStyle | undefined)} />;
}

export function TextInput({ style, ...rest }: TextInputProps) {
  return <RNTextInput {...rest} style={withFace(StyleSheet.flatten(style) as TextStyle | undefined)} />;
}
