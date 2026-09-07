import { z } from "zod";

import {
  CHEM_PROCESSES,
  CONTACT_CHANNELS,
  FILM_FORMATS,
  LAB_STATUSES,
} from "@/lib/labs/paths";

/**
 * What the Add Lab form submits.
 *
 * Creation takes a whole document, where an edit takes a diff — the asymmetry
 * argued in lib/queries/lab-edits.ts. So this is a shape, not a grammar, and it
 * is the one place the create gate is written down.
 *
 * It lives here rather than in the action because the form validates against it
 * too (react-hook-form + zod, B4). Nothing in this module imports the query
 * layer, so it costs the browser bundle nothing but zod, which is already there.
 */

const text = z.string().trim().min(1);
const optionalText = text.nullish().transform((v) => v ?? null);
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected a 24-hour HH:MM time");

/** One day. A closed day carries no times, which is what the reader expects. */
const dayHours = z.union([
  z.object({ closed: z.literal(true) }),
  z.object({ closed: z.literal(false), open: clockTime, close: clockTime }),
]);

const pricingCell = z
  .object({
    process: z.enum(CHEM_PROCESSES),
    format: z.enum(FILM_FORMATS),
    priceThb: z.number().nonnegative().max(999_999.99).nullish(),
    turnaroundMinD: z.number().int().positive().max(365).nullish(),
    turnaroundMaxD: z.number().int().positive().max(365).nullish(),
  })
  // lab_pricing_not_empty: an all-null row is a blank cell, and a blank cell is
  // stored by not storing a row.
  .refine(
    (c) => c.priceThb != null || c.turnaroundMinD != null,
    "a pricing cell needs a price or a turnaround",
  );

const service = z
  .object({
    key: text.optional(),
    customLabel: text.optional(),
    note: optionalText.optional(),
  })
  // lab_services_one_of, said in the form's own words rather than as a 23514.
  .refine(
    (s) => (s.key === undefined) !== (s.customLabel === undefined),
    "a service is either a catalog key or a label of your own, not both",
  );

const supply = z
  .object({ key: text.optional(), customLabel: text.optional() })
  .refine(
    (s) => (s.key === undefined) !== (s.customLabel === undefined),
    "a supply is either a catalog key or a label of your own, not both",
  );

export const newLabSchema = z
  .object({
    nameEn: text,
    nameTh: optionalText.optional(),
    /** The create gate's second condition: a pin, not an address. */
    location: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    areaEn: optionalText.optional(),
    areaTh: optionalText.optional(),
    street: optionalText.optional(),
    landmarkNote: optionalText.optional(),
    status: z.enum(LAB_STATUSES).default("open"),
    statusNote: optionalText.optional(),
    /** Seven days or none; labs_hours_shape allows nothing between. */
    hours: z.array(dayHours).length(7).optional(),
    /** The create gate's third condition. */
    processes: z
      .array(z.enum(CHEM_PROCESSES))
      .min(1, "a lab needs at least one process")
      .refine((p) => new Set(p).size === p.length, "a process is repeated"),
    scanners: z.array(text).default([]),
    pricing: z.array(pricingCell).default([]),
    services: z.array(service).default([]),
    supplies: z.array(supply).default([]),
    contacts: z
      .array(z.object({ channel: z.enum(CONTACT_CHANNELS), value: text }))
      .default([]),
    stock: z
      .array(
        z.object({
          filmStockId: z.uuid(),
          formats: z.array(z.enum(FILM_FORMATS)).default([]),
        }),
      )
      .default([]),
  })
  .superRefine((input, ctx) => {
    // The composite foreign key would reject this anyway, but a form that says
    // "you priced E-6 without offering it" beats a constraint violation the
    // contributor has to translate.
    const offered = new Set(input.processes);
    input.pricing.forEach((cell, i) => {
      if (!offered.has(cell.process)) {
        ctx.addIssue({
          code: "custom",
          path: ["pricing", i, "process"],
          message: `${cell.process} is priced but not offered`,
        });
      }
    });
  });

export type NewLabForm = z.infer<typeof newLabSchema>;
