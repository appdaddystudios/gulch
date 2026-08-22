import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UnauthorizedPage from "./page";

const mocks = vi.hoisted(() => ({
  getAdminIdentity: vi.fn(),
  isAdminIdentity: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getAdminIdentity: mocks.getAdminIdentity,
  isAdminIdentity: mocks.isAdminIdentity
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => <>{children}</>
}));

const identity = { userId: "user_1", email: "stranger@example.com" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("UnauthorizedPage", () => {
  it("redirects to /sign-in when there is no identity", async () => {
    mocks.getAdminIdentity.mockResolvedValue(null);

    await expect(UnauthorizedPage()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.isAdminIdentity).not.toHaveBeenCalled();
  });

  it("redirects to / when the identity is now allowlisted", async () => {
    mocks.getAdminIdentity.mockResolvedValue(identity);
    mocks.isAdminIdentity.mockReturnValue(true);

    await expect(UnauthorizedPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.isAdminIdentity).toHaveBeenCalledWith(identity);
  });

  it("renders the not-an-admin notice when the identity is still blocked", async () => {
    mocks.getAdminIdentity.mockResolvedValue(identity);
    mocks.isAdminIdentity.mockReturnValue(false);

    const html = renderToStaticMarkup(await UnauthorizedPage());

    expect(html).toContain("Not an admin");
    expect(html).toContain("stranger@example.com");
    expect(html).toContain("Sign out");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("falls back to a placeholder when the identity has no email", async () => {
    mocks.getAdminIdentity.mockResolvedValue({ userId: "user_1", email: null });
    mocks.isAdminIdentity.mockReturnValue(false);

    const html = renderToStaticMarkup(await UnauthorizedPage());

    expect(html).toContain("no email");
  });
});
