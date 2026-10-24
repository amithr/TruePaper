import { NextResponse } from "next/server";

import { adminRpcError, requireAdmin } from "@/lib/admin/api";

type Body = {
  billingEnabled?: boolean;
};

/** Admin → Billing: charge for plans, or make everything free. */
export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate.response;
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  if (typeof body.billingEnabled !== "boolean") {
    return NextResponse.json({ error: "billingEnabled must be a boolean." }, { status: 400 });
  }
  const { data, error } = await gate.supabase.rpc("admin_set_billing_enabled", { p_enabled: body.billingEnabled });
  if (error) {
    return adminRpcError(error, "admin_set_billing_enabled");
  }
  return NextResponse.json(data ?? { ok: true, billingEnabled: body.billingEnabled });
}
