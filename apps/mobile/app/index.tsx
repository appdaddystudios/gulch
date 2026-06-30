import type { DbClient } from "@gulch/db";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getCounts, type Counts } from "../lib/stats";
import { createMobileSupabase } from "../lib/supabase";

type CountsState =
  | { readonly status: "missing-client" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly counts: Counts }
  | { readonly status: "error"; readonly message: string };

const loadCounts = async (
  client: DbClient | null,
  setState: (state: CountsState) => void,
) => {
  if (!client) {
    setState({ status: "missing-client" });
    return;
  }

  setState({ status: "loading" });

  try {
    const counts = await getCounts(client);
    setState({ status: "ready", counts });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load Supabase counts.";
    setState({ status: "error", message });
  }
};

export default function Index() {
  const client = useMemo(() => createMobileSupabase(), []);
  const [state, setState] = useState<CountsState>({ status: "loading" });

  useEffect(() => {
    void loadCounts(client, setState);
  }, [client]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.kicker}>TEMPORARY -- pending Figma design</Text>
        <Text style={styles.title}>Gulch mobile shell</Text>
        <Text style={styles.body}>
          This screen only verifies that Expo Router, workspace imports, and
          live Supabase connectivity are wired.
        </Text>

        <View style={styles.panel}>
          {state.status === "loading" ? (
            <View style={styles.inline}>
              <ActivityIndicator />
              <Text style={styles.status}>Loading Supabase counts...</Text>
            </View>
          ) : null}

          {state.status === "missing-client" ? (
            <Text style={styles.status}>
              Not connected. EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY are not configured.
            </Text>
          ) : null}

          {state.status === "error" ? (
            <Text style={styles.status}>Not connected. {state.message}</Text>
          ) : null}

          {state.status === "ready" ? (
            <View style={styles.grid}>
              <CountLabel label="Locations" value={state.counts.locations} />
              <CountLabel label="Events" value={state.counts.events} />
              <CountLabel label="Shows" value={state.counts.shows} />
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void loadCounts(client, setState);
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Refresh</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CountLabel({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <View style={styles.countBlock}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f6f4ef",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  kicker: {
    alignSelf: "flex-start",
    borderColor: "#151515",
    borderWidth: 1,
    color: "#151515",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
  title: {
    color: "#151515",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 38,
    marginBottom: 12,
  },
  body: {
    color: "#4f4a43",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
  },
  panel: {
    borderColor: "#d8d2c6",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    minHeight: 128,
    padding: 18,
  },
  inline: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  status: {
    color: "#151515",
    fontSize: 15,
    lineHeight: 22,
  },
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  countBlock: {
    flex: 1,
  },
  countValue: {
    color: "#151515",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 36,
  },
  countLabel: {
    color: "#655f57",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#151515",
    borderRadius: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
