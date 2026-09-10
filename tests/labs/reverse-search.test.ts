import { describe, expect, it } from "vitest";

import {
  hasActiveFilters,
  toApiQuery,
  type LabSearchState,
} from "@/components/labs/search-state";

/**
 * The reverse search — "labs that carry this stock" — as it travels through
 * the URL.
 *
 * Two serializations meet here and they are deliberately different: `/labs`
 * carries `?stock=<uuid>` because that is short and readable, and `/api/labs`
 * takes `film_stock_id` because that is the column. A rename on either side
 * silently returns every lab instead of the ones that carry the stock, which
 * looks like a working page.
 */
const base: LabSearchState = {
  lat: 13.7563,
  lng: 100.5018,
  r: 5000,
  process: [],
  scanner: [],
  service: [],
  open: false,
  stock: null,
};

describe("the stock filter in the URL", () => {
  it("becomes film_stock_id for the API", () => {
    const query = new URLSearchParams(
      toApiQuery({ ...base, stock: "0f3c9d2e-1111-2222-3333-444455556666" }),
    );
    expect(query.get("film_stock_id")).toBe(
      "0f3c9d2e-1111-2222-3333-444455556666",
    );
  });

  it("is absent when nothing is filtered", () => {
    expect(new URLSearchParams(toApiQuery(base)).has("film_stock_id")).toBe(
      false,
    );
  });

  it("counts as an active filter", () => {
    // This is what puts "Clear filters" on screen and what makes an empty
    // result show "no labs match these filters" rather than "no labs nearby" —
    // two different empty states with two different suggested actions.
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, stock: "abc" })).toBe(true);
  });

  it("is dropped when the search ignores filters", () => {
    // The near-miss query re-runs the same search without any filter, to show
    // what was excluded. A stock left in would make near-misses identical to
    // the results.
    const query = new URLSearchParams(
      toApiQuery({ ...base, stock: "abc" }, { ignoreFilters: true }),
    );
    expect(query.has("film_stock_id")).toBe(false);
  });

  it("keeps where and how far alongside it", () => {
    const query = new URLSearchParams(toApiQuery({ ...base, stock: "abc" }));
    expect(query.get("lat")).toBe("13.7563");
    expect(query.get("lng")).toBe("100.5018");
    expect(query.get("radius_m")).toBe("5000");
  });
});
