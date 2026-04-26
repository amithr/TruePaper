import { NextResponse } from "next/server";

import { generateJoinCode } from "@/lib/join-code";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type Body = {
  durationMinutes?: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export async function POST(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const authSession = await getSessionUser(supabase);

  if (!authSession?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (authSession.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can start a timed session." }, { status: 403 });
  }

  const { formId } = await params;
  const body = (await request.json()) as Body;
  const durationMinutes = clamp(Math.round(Number(body.durationMinutes) || 45), 5, 480);
  const opensAt = new Date();
  const closesAt = new Date(opensAt.getTime() + durationMinutes * 60 * 1000);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const joinCode = generateJoinCode();
    const { data, error } = await supabase
      .from("form_sessions")
      .insert({
        join_code: joinCode,
        form_id: formId,
        created_by: authSession.user.id,
        opens_at: opensAt.toISOString(),
        closes_at: closesAt.toISOString(),
      })
      .select("id, join_code, opens_at, closes_at")
      .single();

    if (!error && data) {
      return NextResponse.json({
        liveSessionId: data.id,
        joinCode: data.join_code,
        opensAt: data.opens_at,
        closesAt: data.closes_at,
        durationMinutes,
      });
    }

    if (error?.code !== "23505") {
      return NextResponse.json({ error: error?.message ?? "Failed to create session." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not allocate a unique join code. Try again." }, { status: 500 });
}
