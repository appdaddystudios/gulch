import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { assertAdmin, getAdminIdentity, getAllowedEmails, requireAdmin } from "./auth";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

const ORIGINAL_ALLOWED = process.env.ADMIN_ALLOWED_EMAILS;

const signedOut = { userId: null, sessionClaims: null };
const signedIn = (email: unknown) => ({ userId: "user_1", sessionClaims: { email } });
const signedInNoClaim = { userId: "user_1", sessionClaims: {} };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.ADMIN_ALLOWED_EMAILS = "Owner@Example.com, editor@example.com";
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

afterAll(() => {
  if (ORIGINAL_ALLOWED === undefined) {
    delete process.env.ADMIN_ALLOWED_EMAILS;
  } else {
    process.env.ADMIN_ALLOWED_EMAILS = ORIGINAL_ALLOWED;
  }
});

describe("getAllowedEmails", () => {
  it("throws when ADMIN_ALLOWED_EMAILS is empty (fail closed)", () => {
    process.env.ADMIN_ALLOWED_EMAILS = " , ";

    expect(() => getAllowedEmails()).toThrow(/ADMIN_ALLOWED_EMAILS is empty/);
  });

  it("throws when ADMIN_ALLOWED_EMAILS is unset", () => {
    delete process.env.ADMIN_ALLOWED_EMAILS;

    expect(() => getAllowedEmails()).toThrow(/ADMIN_ALLOWED_EMAILS is empty/);
  });

  it("returns the normalised set when configured", () => {
    expect([...getAllowedEmails()]).toEqual(["owner@example.com", "editor@example.com"]);
  });
});

describe("getAdminIdentity", () => {
  it("returns null when there is no session", async () => {
    mocks.auth.mockResolvedValue(signedOut);

    expect(await getAdminIdentity()).toBeNull();
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it("uses the email session claim without calling currentUser", async () => {
    mocks.auth.mockResolvedValue(signedIn("owner@example.com"));

    expect(await getAdminIdentity()).toEqual({ userId: "user_1", email: "owner@example.com" });
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it("falls back to currentUser when the claim is missing", async () => {
    mocks.auth.mockResolvedValue(signedInNoClaim);
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "editor@example.com" }
    });

    expect(await getAdminIdentity()).toEqual({ userId: "user_1", email: "editor@example.com" });
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
  });

  it("falls back to currentUser when the claim is not a string", async () => {
    mocks.auth.mockResolvedValue(signedIn(42));
    mocks.currentUser.mockResolvedValue({ primaryEmailAddress: null });

    expect(await getAdminIdentity()).toEqual({ userId: "user_1", email: null });
  });

  it("returns a null email when currentUser has no record", async () => {
    mocks.auth.mockResolvedValue(signedInNoClaim);
    mocks.currentUser.mockResolvedValue(null);

    expect(await getAdminIdentity()).toEqual({ userId: "user_1", email: null });
  });
});

describe("requireAdmin", () => {
  it("redirects to /sign-in when there is no session", async () => {
    mocks.auth.mockResolvedValue(signedOut);

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("returns the identity when the email is allowlisted", async () => {
    mocks.auth.mockResolvedValue(signedIn("OWNER@example.com"));

    expect(await requireAdmin()).toEqual({ userId: "user_1", email: "OWNER@example.com" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to /unauthorized when the email is not allowlisted", async () => {
    mocks.auth.mockResolvedValue(signedIn("stranger@example.com"));

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
    expect(mocks.redirect).toHaveBeenCalledWith("/unauthorized");
  });

  it("throws before checking the session when the allowlist is empty", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "";
    mocks.auth.mockResolvedValue(signedIn("owner@example.com"));

    await expect(requireAdmin()).rejects.toThrow(/ADMIN_ALLOWED_EMAILS is empty/);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});

describe("assertAdmin", () => {
  it("throws Unauthorized when there is no session", async () => {
    mocks.auth.mockResolvedValue(signedOut);

    await expect(assertAdmin()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when the email is not allowlisted", async () => {
    mocks.auth.mockResolvedValue(signedIn("stranger@example.com"));

    await expect(assertAdmin()).rejects.toThrow("Forbidden");
  });

  it("throws Forbidden when no email can be resolved", async () => {
    mocks.auth.mockResolvedValue(signedInNoClaim);
    mocks.currentUser.mockResolvedValue(null);

    await expect(assertAdmin()).rejects.toThrow("Forbidden");
  });

  it("returns the identity when the email is allowlisted", async () => {
    mocks.auth.mockResolvedValue(signedIn("editor@example.com"));

    expect(await assertAdmin()).toEqual({ userId: "user_1", email: "editor@example.com" });
  });

  it("throws when the allowlist is empty", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "";

    await expect(assertAdmin()).rejects.toThrow(/ADMIN_ALLOWED_EMAILS is empty/);
  });
});
