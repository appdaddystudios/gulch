import { Stack } from "expo-router";
import { useEffect } from "react";

import { initTelemetry } from "../lib/telemetry";

export default function RootLayout() {
  useEffect(() => {
    void initTelemetry();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false
      }}
    />
  );
}
