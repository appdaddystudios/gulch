import { describe, expect, it } from "vitest";

import * as pipeline from "../src";

describe("@gulch/pipeline exports", () => {
  it("re-exports public factories and constants", () => {
    expect(pipeline.createGeocoder).toBeTypeOf("function");
    expect(pipeline.createWebflowClient).toBeTypeOf("function");
    expect(pipeline.runSeed).toBeTypeOf("function");
    expect(pipeline.WEBFLOW_COLLECTION_IDS.locations).toBe("6843bee91e942f36fd3adc06");
  });
});
