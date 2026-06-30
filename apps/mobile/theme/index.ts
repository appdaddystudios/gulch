// Design tokens for the Gulch mobile app.
// Sourced from the Figma file "GULCH App Design" (fileKey dDlTGANQnQsQW7ey1ZoZPm).
// The visual language is a warm, neo-brutalist palette: dark chocolate surfaces,
// chunky #291407 borders, and hard (zero-blur) offset drop shadows.

import type { TextStyle } from "react-native";

// Raw palette — names mirror the Figma variable names.
export const color = {
  oreo: "#291407", // Brown600 — borders + hard shadow
  brown400: "#543C2D", // full-width banner surface
  brown300: "#93684B", // Mocha — compact banner card surface
  darkChocolate: "#3F220F", // app / header / nav background
  brown100: "#F3F0EE", // light banner surface
  latte: "#B87832", // Editor's Pick badge
  beige300: "#B7A182", // light button surface, "Sponsored" text
  khakis: "#DBD1C3", // secondary text on dark surfaces
  gulchGreen: "#D9FF71", // active accent
  white: "#FFFFFF",
  grey100: "#343433",
  grey80: "#757371", // placeholder text, home indicator
  black: "#000000",
} as const;

// Semantic aliases — prefer these in components so a palette change stays local.
export const semantic = {
  screenBg: color.darkChocolate,
  headerBg: color.darkChocolate,
  navBg: color.darkChocolate,
  surface: color.brown300,
  surfaceAlt: color.brown400,
  surfaceLight: color.brown100,
  surfaceWhite: color.white,
  border: color.oreo,
  shadow: color.oreo,
  textOnDark: color.white,
  textMutedOnDark: color.khakis,
  textOnLight: color.darkChocolate,
  accent: color.gulchGreen,
  accentSurface: color.latte,
  placeholder: color.grey80,
} as const;

// Spacing scale — multiples of 4 (with 2/6 half-steps the design uses).
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  huge: 44,
} as const;

export const radius = {
  image: 8,
  card: 24,
  pill: 999,
} as const;

// Ubuntu (Google Font) is the brand typeface. Family names match the
// @expo-google-fonts/ubuntu exports loaded in app/_layout.tsx.
export const font = {
  regular: "Ubuntu_400Regular",
  medium: "Ubuntu_500Medium",
  bold: "Ubuntu_700Bold",
} as const;

// Text style presets. Names map to the Figma type styles.
export const type = {
  // HXS Bold — section titles + banner headlines.
  h24Bold: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  // Body Regular.
  body16: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  // Body XS Bold — compact card titles.
  bodyBold14: {
    fontFamily: font.bold,
    fontSize: 14,
    lineHeight: 21,
  },
  // Caption Bold — event card name.
  captionBold12: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  // Caption Semibold — button text.
  captionMedium12: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  // Caption Regular — org / location / supporting copy.
  caption12: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  // 10px micro labels — tab bar labels and pill badges.
  label10Medium: {
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 15,
  },
  label10Regular: {
    fontFamily: font.regular,
    fontSize: 10,
    lineHeight: 15,
  },
} as const satisfies Record<string, TextStyle>;

// Hard, zero-blur offset shadow (4px 4px 0 #291407) used on cards + inputs.
// iOS uses shadow*, Android approximates with elevation.
export const hardShadow = {
  shadowColor: semantic.shadow,
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
} as const;

// Lighter hard shadow for the header (0px 2px 0 #291407).
export const headerShadow = {
  shadowColor: semantic.shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 2,
} as const;

export const theme = {
  color,
  semantic,
  space,
  radius,
  font,
  type,
  hardShadow,
  headerShadow,
} as const;

export type Theme = typeof theme;
