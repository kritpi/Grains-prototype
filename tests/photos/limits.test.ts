import { describe, expect, it } from "vitest";

import {
  ALLOWED_CONTENT_TYPES,
  checkUpload,
  formatBytes,
  MAX_UPLOAD_BYTES,
} from "@/lib/photos/limits";

const ONE_MB = 1024 * 1024;

describe("checkUpload", () => {
  it("accepts every type on the list", () => {
    for (const contentType of ALLOWED_CONTENT_TYPES) {
      expect(checkUpload({ contentType, bytes: ONE_MB }).ok).toBe(true);
    }
  });

  it("refuses a type that is not an image a browser renders", () => {
    // HEIC is the one worth naming: Safari would show it and nothing else
    // would, so it is absent on purpose rather than by oversight.
    for (const contentType of [
      "image/heic",
      "image/tiff",
      "application/pdf",
      "text/html",
    ]) {
      expect(checkUpload({ contentType, bytes: ONE_MB }).ok).toBe(false);
    }
  });

  it("refuses an object with no recorded type", () => {
    // What a PUT that omitted Content-Type leaves behind.
    expect(checkUpload({ contentType: null, bytes: ONE_MB }).ok).toBe(false);
  });

  it("refuses an empty object", () => {
    // What a PUT cut off halfway leaves behind. Without this it becomes a Photo
    // whose image never loads.
    expect(checkUpload({ contentType: "image/jpeg", bytes: 0 }).ok).toBe(false);
  });

  it("draws the size line exactly at the limit", () => {
    expect(
      checkUpload({ contentType: "image/jpeg", bytes: MAX_UPLOAD_BYTES }).ok,
    ).toBe(true);
    expect(
      checkUpload({ contentType: "image/jpeg", bytes: MAX_UPLOAD_BYTES + 1 })
        .ok,
    ).toBe(false);
  });

  it("names a small file in KB, not as 0.0 MB", () => {
    expect(formatBytes(4 * 1024)).toBe("4 KB");
    expect(formatBytes(1)).toBe("1 KB");
    expect(formatBytes(3 * ONE_MB)).toBe("3.0 MB");
    expect(formatBytes(24 * ONE_MB)).toBe("24 MB");
  });

  it("says what is wrong in words a person can act on", () => {
    const tooBig = checkUpload({
      contentType: "image/jpeg",
      bytes: 40 * ONE_MB,
    });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.message).toContain("40");
      expect(tooBig.message).toContain("25 MB");
    }
  });
});
