import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addFeaturedOrganizer,
  moveFeaturedOrganizerDown,
  moveFeaturedOrganizerUp,
  removeFeaturedOrganizer,
  saveBanner,
  saveResearch,
  toggleEventSponsored,
  type ActionResult
} from "./actions";

const mocks = vi.hoisted(() => ({
  assertAdmin: vi.fn(),
  createServiceSupabase: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ assertAdmin: mocks.assertAdmin }));
vi.mock("@/lib/supabase", () => ({
  createServiceSupabase: mocks.createServiceSupabase,
  createServerSupabase: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const PREV: ActionResult = { ok: true, error: null, saved: false };

const form = (fields: Readonly<Record<string, string>>): FormData => {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  return data;
};

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const cases: ReadonlyArray<readonly [string, Action, FormData]> = [
  ["saveResearch", saveResearch, form({ label: "Survey", url: "https://example.com" })],
  ["saveBanner", saveBanner, form({ enabled: "on", title: "Hi", body: "", linkUrl: "" })],
  ["addFeaturedOrganizer", addFeaturedOrganizer, form({ organizerId: "org_1" })],
  ["removeFeaturedOrganizer", removeFeaturedOrganizer, form({ organizerId: "org_1" })],
  ["moveFeaturedOrganizerUp", moveFeaturedOrganizerUp, form({ organizerId: "org_1" })],
  ["moveFeaturedOrganizerDown", moveFeaturedOrganizerDown, form({ organizerId: "org_1" })],
  ["toggleEventSponsored", toggleEventSponsored, form({ eventId: "evt_1", sponsored: "true" })]
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("server actions require an allowlisted admin", () => {
  it.each(cases)("%s returns Forbidden before touching the service client", async (_name, action, data) => {
    mocks.assertAdmin.mockRejectedValue(new Error("Forbidden"));

    const result = await action(PREV, data);

    expect(result).toEqual({ ok: false, error: "Forbidden", saved: false });
    expect(mocks.createServiceSupabase).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("saveResearch returns Unauthorized when there is no session", async () => {
    mocks.assertAdmin.mockRejectedValue(new Error("Unauthorized"));

    const result = await saveResearch(PREV, form({ label: "Survey", url: "https://example.com" }));

    expect(result.error).toBe("Unauthorized");
    expect(mocks.createServiceSupabase).not.toHaveBeenCalled();
  });

  it("toggleEventSponsored returns Unauthorized when there is no session", async () => {
    mocks.assertAdmin.mockRejectedValue(new Error("Unauthorized"));

    const result = await toggleEventSponsored(PREV, form({ eventId: "evt_1", sponsored: "true" }));

    expect(result.error).toBe("Unauthorized");
    expect(mocks.createServiceSupabase).not.toHaveBeenCalled();
  });

  it("checks identity even before input validation", async () => {
    mocks.assertAdmin.mockRejectedValue(new Error("Forbidden"));

    const result = await saveResearch(PREV, form({ label: "", url: "not-a-url" }));

    expect(result.error).toBe("Forbidden");
  });

  it("reaches the service client once the admin check passes", async () => {
    mocks.assertAdmin.mockResolvedValue({ userId: "user_1", email: "owner@example.com" });
    mocks.createServiceSupabase.mockReturnValue(null);

    const result = await saveResearch(PREV, form({ label: "Survey", url: "https://example.com" }));

    expect(mocks.assertAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.createServiceSupabase).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Admin write client unavailable/);
  });
});
