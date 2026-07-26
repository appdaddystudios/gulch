import AsyncStorage from "@react-native-async-storage/async-storage";

export const DEVICE_ID_KEY = "gulch.deviceId.v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Non-cryptographic v4 UUID — a stable anonymous handle for the save ledger,
// not a secret. Postgres only requires the uuid column format.
export const generateUuid = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

let cached: string | null = null;

// Stable per-install id; survives restarts, regenerates only if storage was
// cleared or holds a malformed value.
export const getDeviceId = async (): Promise<string> => {
  if (cached) {
    return cached;
  }
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored && UUID_PATTERN.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // Fall through to a fresh id.
  }
  const fresh = generateUuid();
  cached = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {
    // Best-effort persistence; the in-memory id still serves this session.
  }
  return fresh;
};

export const resetDeviceIdForTest = (): void => {
  cached = null;
};
