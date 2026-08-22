import { beforeEach, describe, expect, it, vi } from "vitest";

import proxy, { config } from "./proxy";

type Handler = (
  auth: { readonly protect: () => Promise<unknown> },
  req: { readonly nextUrl: { readonly pathname: string } }
) => Promise<void>;

const mocks = vi.hoisted(() => ({
  handler: null as Handler | null
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: vi.fn((handler: Handler) => {
    mocks.handler = handler;
    return handler;
  })
}));

const protect = vi.fn().mockResolvedValue(undefined);

const run = (pathname: string): Promise<void> => {
  if (!mocks.handler) {
    throw new Error("clerkMiddleware handler was not registered");
  }
  return mocks.handler({ protect }, { nextUrl: { pathname } });
};

beforeEach(() => {
  protect.mockClear();
});

describe("proxy", () => {
  it("registers the handler with clerkMiddleware", () => {
    expect(proxy).toBe(mocks.handler);
  });

  it("skips auth.protect for public paths", async () => {
    await run("/sign-in");
    await run("/sign-in/sso-callback");
    await run("/unauthorized");

    expect(protect).not.toHaveBeenCalled();
  });

  it("calls auth.protect for protected paths", async () => {
    await run("/");
    await run("/api/anything");

    expect(protect).toHaveBeenCalledTimes(2);
  });

  it("exports a matcher that runs on pages and API routes", () => {
    expect(config.matcher).toHaveLength(2);
    expect(config.matcher[1]).toBe("/(api|trpc)(.*)");
  });
});
