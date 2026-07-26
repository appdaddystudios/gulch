import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const getItem = vi.fn(async (key: string) => store.get(key) ?? null);
const setItem = vi.fn(async (key: string, value: string) => {
  store.set(key, value);
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
  },
}));

import {
  DEVICE_ID_KEY,
  generateUuid,
  getDeviceId,
  resetDeviceIdForTest,
} from "./deviceId";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  store.clear();
  getItem.mockClear();
  setItem.mockClear();
  resetDeviceIdForTest();
});

describe("generateUuid", () => {
  it("produces v4-format uuids", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateUuid()).toMatch(UUID_PATTERN);
    }
  });
});

describe("getDeviceId", () => {
  it("generates and persists an id on first use", async () => {
    const id = await getDeviceId();
    expect(id).toMatch(UUID_PATTERN);
    expect(store.get(DEVICE_ID_KEY)).toBe(id);
  });

  it("returns the stored id on later calls", async () => {
    store.set(DEVICE_ID_KEY, "12345678-abcd-4def-9abc-1234567890ab");
    await expect(getDeviceId()).resolves.toBe(
      "12345678-abcd-4def-9abc-1234567890ab",
    );
  });

  it("caches in memory after the first read", async () => {
    const first = await getDeviceId();
    const second = await getDeviceId();
    expect(second).toBe(first);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the stored value is malformed", async () => {
    store.set(DEVICE_ID_KEY, "not-a-uuid");
    const id = await getDeviceId();
    expect(id).toMatch(UUID_PATTERN);
    expect(store.get(DEVICE_ID_KEY)).toBe(id);
  });

  it("still returns an id when storage fails entirely", async () => {
    getItem.mockRejectedValueOnce(new Error("nope"));
    setItem.mockRejectedValueOnce(new Error("nope"));
    await expect(getDeviceId()).resolves.toMatch(UUID_PATTERN);
  });
});
