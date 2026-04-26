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
  return err.code === "42703";
}
