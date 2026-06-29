import { describe, expect, it } from "vitest";

import { configVersion } from "./index";

describe("configVersion", () => {
  it("returns the package version", () => {
    expect(configVersion()).toBe("0.0.0");
  });
});
