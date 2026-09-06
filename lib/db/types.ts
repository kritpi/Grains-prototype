import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS `geography(Point, 4326)`.
 *
 * Deliberately opaque: the driver returns WKB hex and this type does not
 * decode it. Every read that needs coordinates asks PostGIS for them
 * (`ST_Y(location) as lat, ST_X(location) as lng`) and every write hands
 * PostGIS the numbers (`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`),
 * so a WKB parser would only be a second, weaker implementation of something
 * the database already does correctly.
 *
 * Geography rather than geometry, because ST_DWithin then takes metres and
 * describes a true circle. See 00_BACKLOG.md Pillar 2: this is a correctness
 * choice, not a performance one.
 */
export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geography(Point,4326)";
  },
});
