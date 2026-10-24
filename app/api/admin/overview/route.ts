import { NextResponse } from "next/server";

import { adminRpcError, requireAdmin } from "@/lib/admin/api";

/** Headline counts + the global billing switch. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate.response;
  }
  const { data, error } = await gate.supabase.rpc("admin_get_overview");
  if (error) {
    return adminRpcError(error, "admin_get_overview");
  }
  return NextResponse.json(data ?? {});
}
