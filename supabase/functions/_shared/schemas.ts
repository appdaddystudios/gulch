import { z } from "npm:zod";

export const COLLECTIONS = {
  organizers: "6a430e64b51f80db57a22b3c",
  locations: "6843bee91e942f36fd3adc06",
  events: "6845d39c294d60e4c197cee9",
  shows: "6865fb691dda49a9c7043754"
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export const TABLE_BY_COLLECTION_ID: Readonly<Record<string, CollectionName>> = {
  [COLLECTIONS.organizers]: "organizers",
  [COLLECTIONS.locations]: "locations",
  [COLLECTIONS.events]: "events",
  [COLLECTIONS.shows]: "shows"
};

const requiredString = z.string().min(1, "Required string cannot be empty");
const optionalString = z.string().nullish().transform((value) => (value == null || value.trim() === "" ? null : value));

export const webflowItemEnvelopeSchema = z
  .object({
    id: requiredString,
    cmsLocaleId: z.string().optional(),
    lastPublished: z.string().nullable().optional(),
    lastUpdated: requiredString,
    createdOn: requiredString,
    isArchived: z.boolean(),
    isDraft: z.boolean(),
    fieldData: z.object({}).passthrough()
  })
  .passthrough();

export const locationFieldDataSchema = z.object({
  name: requiredString,
  slug: requiredString,
  "plain-text-name-address": optionalString,
  "google-maps-link-url": optionalString,
  "neighborhood-optional": optionalString,
  "parking-optional": optionalString,
  "hide-from-locations-list": z.boolean().nullable().optional(),
  "is-organizer": z.boolean().nullable().optional(),
  "managing-organizer": optionalString
});

export const eventFieldDataSchema = z.object({
  name: requiredString,
  slug: requiredString,
  "start-date-time": requiredString,
  "end-date-time": optionalString,
  "custom-time-description": optionalString,
  location: optionalString,
  "external-link": optionalString,
  "show-tickets-required-tag": z.boolean().nullable().optional(),
  "additional-organizers": z
    .array(z.union([z.string(), z.object({ id: z.string() }).passthrough()]))
    .nullish()
    .transform((a) => (a ?? []).map((x) => (typeof x === "string" ? x : x.id)))
});

export const organizerFieldDataSchema = z.object({
  name: requiredString,
  slug: requiredString,
  "website-url": optionalString,
  "instagram-url": optionalString,
  "facebook-url": optionalString,
  "is-featured": z.boolean().nullable().optional(),
  "custom-color": optionalString
});

export const showFieldDataSchema = z.object({
  name: requiredString,
  slug: requiredString,
  "start-date": optionalString,
  "end-date": optionalString,
  location: optionalString,
  "external-link": optionalString
});

export const webflowLocationItemSchema = webflowItemEnvelopeSchema.extend({ fieldData: locationFieldDataSchema });
export const webflowEventItemSchema = webflowItemEnvelopeSchema.extend({ fieldData: eventFieldDataSchema });
export const webflowOrganizerItemSchema = webflowItemEnvelopeSchema.extend({ fieldData: organizerFieldDataSchema });
export const webflowShowItemSchema = webflowItemEnvelopeSchema.extend({ fieldData: showFieldDataSchema });

export const webflowLiveItemsResponseSchema = z
  .object({
    items: z.array(webflowItemEnvelopeSchema),
    pagination: z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        total: z.number().optional()
      })
      .partial()
      .optional()
  })
  .passthrough();

export type WebflowItem = z.infer<typeof webflowItemEnvelopeSchema>;
export type WebflowLocationItem = z.infer<typeof webflowLocationItemSchema>;
export type WebflowEventItem = z.infer<typeof webflowEventItemSchema>;
export type WebflowOrganizerItem = z.infer<typeof webflowOrganizerItemSchema>;
export type WebflowShowItem = z.infer<typeof webflowShowItemSchema>;

export function parseWebflowItem<TSchema extends z.ZodTypeAny>(schema: TSchema, raw: unknown): z.infer<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Webflow item: ${issues}`);
  }
  return result.data;
}
