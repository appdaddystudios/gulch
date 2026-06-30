import { describe, expect, it } from "vitest";

import { parseSavedIds, serializeSavedIds, toggleSavedId } from "./savedEvents";

describe("parseSavedIds", () => {
  it("parses a JSON array of ids", () => {
    expect(parseSavedIds('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns an empty array for null", () => {
    expect(parseSavedIds(null)).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseSavedIds('["a",1,null,"b"]')).toEqual(["a", "b"]);
  });

  it("returns an empty array for non-array JSON", () => {
    expect(parseSavedIds('{"a":1}')).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    expect(parseSavedIds("not json")).toEqual([]);
  });
});

describe("serializeSavedIds", () => {
  it("serializes an iterable to a JSON array", () => {
    expect(serializeSavedIds(new Set(["a", "b"]))).toBe('["a","b"]');
  });
});

describe("toggleSavedId", () => {
  it("adds an id that is absent", () => {
    expect(toggleSavedId(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes an id that is present", () => {
    expect(toggleSavedId(["a", "b"], "a")).toEqual(["b"]);
  });
});
