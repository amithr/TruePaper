import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ADMIN_MIGRATION_HINT = "Run migration 20261024140000_admin.sql.";

/** Shared gate for /api/admin/*: signed in, profile flagged admin. */
export async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseClient; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (!session.profile?.is_admin) {
    return { ok: false, response: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { ok: true, supabase, userId: session.user.id };
}

/** Map RPC errors to responses: missing function → 503 with the migration name. */
export function adminRpcError(error: { message: string; code?: string }, fnName: string): NextResponse {
  if (error.message.includes(fnName) || error.code === "42883") {
    return NextResponse.json({ error: `Database is missing ${fnName}. ${ADMIN_MIGRATION_HINT}` }, { status: 503 });
  }
  if (error.message.includes("not allowed")) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (error.message.includes("not found")) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (error.message.includes("own admin flag")) {
    return NextResponse.json({ error: "You can't change your own admin access." }, { status: 400 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}
