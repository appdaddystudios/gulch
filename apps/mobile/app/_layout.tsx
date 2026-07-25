import {
  Ubuntu_400Regular,
  Ubuntu_500Medium,
  Ubuntu_700Bold,
} from "@expo-google-fonts/ubuntu";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SavedEventsProvider } from "../hooks/useSavedEvents";
import { color } from "../theme";
import { captureScreen, initTelemetry } from "../lib/telemetry";

export default function RootLayout() {
  const pathname = usePathname();
  const [telemetryReady, setTelemetryReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Ubuntu_400Regular,
    Ubuntu_500Medium,
    Ubuntu_700Bold,
    "CovikSans-Semibold": require("../assets/fonts/CovikSans-Semibold.ttf"),
  });

  useEffect(() => {
    void initTelemetry().then(() => setTelemetryReady(true));
  }, []);

  // Screen tracking for expo-router: report every pathname change, gated on
  // init so the first (cold-start) screen isn't lost.
  useEffect(() => {
    if (telemetryReady) {
      captureScreen(pathname);
    }
  }, [telemetryReady, pathname]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SavedEventsProvider>
        {fontsLoaded ? (
          <Stack screenOptions={{ headerShown: false }} />
        ) : (
          <View style={{ flex: 1, backgroundColor: color.darkChocolate }} />
        )}
      </SavedEventsProvider>
    </SafeAreaProvider>
  );
}
