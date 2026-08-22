import { describe, expect, it } from "vitest";

import { isAllowedEmail, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("parses two comma-separated emails", () => {
    const allowed = parseAllowedEmails("owner@example.com,editor@example.com");

    expect([...allowed]).toEqual(["owner@example.com", "editor@example.com"]);
  });

  it("trims whitespace and lowercases entries", () => {
    const allowed = parseAllowedEmails("  Owner@Example.COM , Editor@example.com ");

    expect([...allowed]).toEqual(["owner@example.com", "editor@example.com"]);
  });

  it("ignores blank entries", () => {
    const allowed = parseAllowedEmails("owner@example.com,, ,editor@example.com,");

    expect(allowed.size).toBe(2);
  });

  it("returns an empty set for undefined input", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
  });

  it("returns an empty set for an empty string", () => {
    expect(parseAllowedEmails("").size).toBe(0);
  });
});

describe("isAllowedEmail", () => {
  const allowed = parseAllowedEmails("owner@example.com,editor@example.com");

  it("matches case-insensitively", () => {
    expect(isAllowedEmail("OWNER@example.com", allowed)).toBe(true);
    expect(isAllowedEmail(" Editor@Example.com ", allowed)).toBe(true);
  });

  it("rejects emails not on the list", () => {
    expect(isAllowedEmail("stranger@example.com", allowed)).toBe(false);
  });

  it("rejects null and undefined emails", () => {
    expect(isAllowedEmail(null, allowed)).toBe(false);
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isAllowedEmail("owner@example.com", new Set())).toBe(false);
  });
});
