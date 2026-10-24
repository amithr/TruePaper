/**
 * Detects PostgREST/Postgres "column does not exist" errors, e.g. when a migration
 * has not been applied to the remote database yet.
 */
export function isMissingColumnError(
  err: { message?: string | null; code?: string | null } | null | undefined,
  columnFragment: string,
): boolean {
  if (!err) {
    return false;
  }
  const m = (err.message ?? "").toLowerCase();
  const frag = columnFragment.toLowerCase();
  if (!m.includes(frag)) {
    return false;
  }
  if (m.includes("does not exist")) {
    return true;
  }
  // PostgREST wording for a write that names an unknown column:
  // `Could not find the 'x' column of 't' in the schema cache` (PGRST204).
  return err.code === "42703" || err.code === "PGRST204" || m.includes("could not find the");
}

/**
 * Detects "relation does not exist" (42P01), e.g. a table from a migration that has
 * not been applied to the remote database yet.
 */
export function isMissingRelationError(
  err: { message?: string | null; code?: string | null } | null | undefined,
  relationFragment: string,
): boolean {
  if (!err) {
    return false;
  }
  const m = (err.message ?? "").toLowerCase();
  if (!m.includes(relationFragment.toLowerCase())) {
    return false;
  }
  // Postgres: `relation "x" does not exist` (42P01). PostgREST, which fronts the
  // table for the server client: `Could not find the table 'public.x' in the
  // schema cache` (PGRST205).
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    m.includes("does not exist") ||
    m.includes("could not find the table")
  );
}
