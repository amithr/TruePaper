/** Postgres undefined_function (42883) or similar when an RPC has not been migrated yet. */
export function isMissingDbFunctionError(
  err: { message?: string | null; code?: string | null } | null | undefined,
  functionName?: string,
): boolean {
  if (!err) {
    return false;
  }
  if (err.code === "42883") {
    return true;
  }
  const m = (err.message ?? "").toLowerCase();
  if (!m.includes("does not exist")) {
    return false;
  }
  if (functionName) {
    return m.includes(functionName.toLowerCase());
  }
  return m.includes("function");
}
