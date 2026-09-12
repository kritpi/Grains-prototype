/**
 * Asking the browser where the reader is, and saying what happened when it
 * would not tell us.
 *
 * Two surfaces geolocate — the entry screen on `/labs` and the reverse search
 * on a film stock's page — and both had the same two gaps. The button gave no
 * hint that pressing it would raise a permission prompt, which is the one thing
 * a reader wants to know *before* pressing it; and every way of failing
 * collapsed into a single sentence, so "you blocked this site", "your device
 * does not know", "it took too long" and "this page is not served securely" all
 * read as the same shrug. Those have different fixes, and only one of them is
 * something the reader can do anything about.
 *
 * Isomorphic and dependency-free: `support()` touches `window`, so it is called
 * from an event handler or an effect, never during render.
 */

export type LocateFailure =
  /** No `navigator.geolocation` at all. Rare, and not the reader's doing. */
  | "unsupported"
  /**
   * Not an https page and not localhost, so the browser refuses before ever
   * showing a prompt — silently, which is why it is worth naming. This is what
   * a phone testing a dev server over the LAN hits.
   */
  | "insecure"
  /** The reader said no, or had said no before and the browser remembered. */
  | "denied"
  /** The device tried and could not fix a position. */
  | "unavailable"
  /** Ten seconds passed. Usually indoors, usually worth one more press. */
  | "timeout";

/** Whether asking is even possible, checked before the prompt rather than after. */
export function locateSupport(): "ok" | LocateFailure {
  if (typeof window === "undefined") return "unsupported";
  if (!("geolocation" in navigator)) return "unsupported";
  // `isSecureContext` is the browser's own answer to the question, which
  // includes the localhost exemption without this having to know about it.
  if (window.isSecureContext === false) return "insecure";
  return "ok";
}

/** Which of the three ways `getCurrentPosition` fails this was. */
export function locateFailure(error: GeolocationPositionError): LocateFailure {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "denied";
    case error.TIMEOUT:
      return "timeout";
    default:
      return "unavailable";
  }
}

/**
 * What to tell the reader.
 *
 * One sentence, and deliberately without a "…instead" clause: each surface has
 * a different next step to offer — an area list here, a link to the map there —
 * and appends its own.
 */
export function locateMessage(reason: LocateFailure): string {
  switch (reason) {
    case "unsupported":
      return "This browser cannot share a location.";
    case "insecure":
      return "Browsers only share a location with a secure page, and this one is not.";
    case "denied":
      return "Location is blocked for this site — the address bar is where a browser lets you unblock it.";
    case "unavailable":
      return "Your device could not work out where it is.";
    case "timeout":
      return "That took too long — pressing it again often works.";
  }
}

/**
 * The options both callers pass.
 *
 * High accuracy is off because the question is "which labs are near me", answered
 * at a few hundred metres; turning it on costs battery and, on a phone, seconds.
 * Five minutes of cached position is fine for the same reason — nobody crosses
 * the city in the time it takes to press a second button.
 */
export const LOCATE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/** What the button says it will do, before it does it. */
export const LOCATE_HINT =
  "Uses your browser's location — it will ask your permission first.";
