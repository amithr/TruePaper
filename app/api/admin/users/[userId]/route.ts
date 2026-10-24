import { NextResponse } from "next/server";

import { adminRpcError, requireAdmin } from "@/lib/admin/api";
import { isPlanId } from "@/lib/billing/plans";

type Params = {
  params: Promise<{ userId: string }>;
};

type Body = {
  /** A plan id grants it free of charge; `null` removes the override. */
  planOverride?: string | null;
  isAdmin?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One account in depth: profile, billing row, forms, recent sessions. */
export async function GET(_request: Request, { params }: Params) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate.response;
  }
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }
  const { data, error } = await gate.supabase.rpc("admin_get_user", { p_user_id: userId });
  if (error) {
    return adminRpcError(error, "admin_get_user");
  }
  const payload = (data ?? {}) as { ok?: boolean };
  if (!payload.ok) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json(payload);
}

/** Grant a complimentary plan or admin access. */
export async function PATCH(request: Request, { params }: Params) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return gate.response;
  }
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const result: { planOverride?: string | null; isAdmin?: boolean } = {};

  if (body.planOverride !== undefined) {
    if (body.planOverride !== null && !isPlanId(body.planOverride)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }
    const { error } = await gate.supabase.rpc("admin_set_plan_override", {
      p_user_id: userId,
      p_plan: body.planOverride,
    });
    if (error) {
      return adminRpcError(error, "admin_set_plan_override");
    }
    result.planOverride = body.planOverride;
  }

  if (body.isAdmin !== undefined) {
    if (typeof body.isAdmin !== "boolean") {
      return NextResponse.json({ error: "isAdmin must be a boolean." }, { status: 400 });
    }
    const { error } = await gate.supabase.rpc("admin_set_admin", { p_user_id: userId, p_is_admin: body.isAdmin });
    if (error) {
      return adminRpcError(error, "admin_set_admin");
    }
    result.isAdmin = body.isAdmin;
  }

  if (Object.keys(result).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}
