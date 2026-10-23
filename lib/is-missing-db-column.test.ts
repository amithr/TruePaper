import { describe, expect, it } from "vitest";

import { isMissingColumnError, isMissingRelationError } from "@/lib/is-missing-db-column";

describe("isMissingRelationError", () => {
  it("recognises Postgres and PostgREST wording for a table from an unapplied migration", () => {
    expect(
      isMissingRelationError(
        { code: "42P01", message: 'relation "public.live_session_device_transfers" does not exist' },
        "live_session_device_transfers",
      ),
    ).toBe(true);
    expect(
      isMissingRelationError(
        {
          code: "PGRST205",
          message: "Could not find the table 'public.live_session_device_transfers' in the schema cache",
        },
        "live_session_device_transfers",
      ),
    ).toBe(true);
  });

  it("ignores other errors and other tables", () => {
    expect(isMissingRelationError({ code: "42501", message: "permission denied for table live_session_device_transfers" }, "live_session_device_transfers")).toBe(false);
    expect(isMissingRelationError({ code: "PGRST205", message: "Could not find the table 'public.other' in the schema cache" }, "live_session_device_transfers")).toBe(false);
    expect(isMissingRelationError(null, "x")).toBe(false);
  });
});

describe("isMissingColumnError", () => {
  it("matches a missing column by fragment", () => {
    expect(isMissingColumnError({ code: "42703", message: "column fr.rejoin does not exist" }, "rejoin")).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: "column fr.rejoin does not exist" }, "other")).toBe(false);
  });
});
