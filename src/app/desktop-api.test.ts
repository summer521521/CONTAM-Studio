import { describe, expect, it } from "vitest";
import { selectAndReadPrjZones } from "./desktop-api";

describe("desktop API boundary", () => {
  it("accepts only requestId and cannot receive a source path", () => {
    expect(selectAndReadPrjZones).toHaveLength(1);
  });
});
