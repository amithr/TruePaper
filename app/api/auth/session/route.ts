import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ user: null, profile: null });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
    },
    profile: session.profile,
  });
}
