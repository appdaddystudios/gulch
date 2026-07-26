import {
  Ubuntu_400Regular,
  Ubuntu_500Medium,
  Ubuntu_700Bold,
} from "@expo-google-fonts/ubuntu";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SavedEventsProvider } from "../hooks/useSavedEvents";
import { color } from "../theme";
import { captureScreen, initTelemetry } from "../lib/telemetry";

// Hold the native (static) splash until fonts land — V3 punch list dropped the
// animated JS splash in favor of the higher-res static art.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden / unavailable (e.g. tests) — nothing to hold.
});

export default function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded, fontsError] = useFonts({
    Ubuntu_400Regular,
    Ubuntu_500Medium,
    Ubuntu_700Bold,
    "CovikSans-Semibold": require("../assets/fonts/CovikSans-Semibold.ttf"),
  });

  useEffect(() => {
    void initTelemetry();
  }, []);

  // Screen tracking for expo-router. Captures fired before init settles
  // (including this cold-start screen) are buffered inside telemetry.
  useEffect(() => {
    captureScreen(pathname);
  }, [pathname]);

  // A font-load failure must also release the splash — otherwise
  // preventAutoHideAsync traps the user on it forever.
  useEffect(() => {
    if (fontsLoaded || fontsError) {
      void SplashScreen.hideAsync().catch(() => {
        // Racing the auto-hide fallback is safe to ignore.
      });
    }
  }, [fontsLoaded, fontsError]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SavedEventsProvider>
        {fontsLoaded || fontsError ? (
          // On font failure the app still renders (system font fallback)
          // rather than sitting behind a hidden splash on a dark view.
          <Stack screenOptions={{ headerShown: false }} />
        ) : (
          <View style={{ flex: 1, backgroundColor: color.darkChocolate }} />
        )}
      </SavedEventsProvider>
    </SafeAreaProvider>
  );
}
