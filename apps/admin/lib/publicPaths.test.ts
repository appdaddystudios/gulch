import { describe, expect, it } from "vitest";

import { isPublicPath } from "./publicPaths";

describe("isPublicPath", () => {
  it("treats the sign-in route and its catch-all children as public", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-in/sso-callback")).toBe(true);
    expect(isPublicPath("/sign-in/factor-one")).toBe(true);
  });

  it("treats the unauthorized page as public", () => {
    expect(isPublicPath("/unauthorized")).toBe(true);
  });

  it("does not match look-alike prefixes", () => {
    expect(isPublicPath("/sign-in-admin")).toBe(false);
    expect(isPublicPath("/unauthorized-ish")).toBe(false);
  });

  it("treats the dashboard and everything else as protected", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/anything")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
  });
});
