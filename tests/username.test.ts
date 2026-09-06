import { describe, expect, it } from "vitest";

import { usernameSchema } from "@/lib/username";

describe("username rules", () => {
  it("accepts an ordinary handle", () => {
    expect(usernameSchema.parse("somchai.film")).toBe("somchai.film");
    expect(usernameSchema.parse("  kritpi  ")).toBe("kritpi");
  });

  it.each([
    ["ab", "too short"],
    ["a".repeat(31), "too long"],
    ["Somchai", "uppercase"],
    ["som chai", "space"],
    ["som-chai", "hyphen"],
    ["som@chai", "at sign"],
    [".somchai", "leading dot"],
    ["somchai.", "trailing dot"],
  ])("rejects %s (%s)", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it.each(["labs", "films", "api", "u", "welcome", "sign-in", "admin"])(
    "reserves %s, so it can never shadow a route",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );
});
