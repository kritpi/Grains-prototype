import { z } from "zod";

/**
 * Routes that a username must never shadow, because /u/@name is not the only
 * path shape in the product and a claimed "labs" or "api" would be a
 * permanent, unfixable collision once someone owns it.
 */
const RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "films",
  "grains",
  "labs",
  "photos",
  "settings",
  "sign-in",
  "sign-out",
  "u",
  "welcome",
]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters.")
  .max(30, "At most 30 characters.")
  .regex(
    /^[a-z0-9_.]+$/,
    "Lowercase letters, numbers, underscore and dot only.",
  )
  .refine((value) => !value.startsWith(".") && !value.endsWith("."), {
    message: "Cannot start or end with a dot.",
  })
  .refine((value) => !RESERVED.has(value), { message: "That name is taken." });

export function isReserved(value: string): boolean {
  return RESERVED.has(value.toLowerCase());
}
