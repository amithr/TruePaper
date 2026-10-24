import { NextResponse } from "next/server";

import { adminRpcError, requireAdmin } from "@/lib/admin/api";

/** Search / page through every account. `?q=` matches email or name. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate.response;
  }
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const { data, error } = await gate.supabase.rpc("admin_list_users", {
    p_query: q || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    return adminRpcError(error, "admin_list_users");
  }
  const payload = (data ?? {}) as { total?: number; users?: unknown[] };
  return NextResponse.json({ total: payload.total ?? 0, users: payload.users ?? [], limit, offset });
}
