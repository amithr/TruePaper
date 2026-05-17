import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { getSupabaseJwtSecret, mintStudentRealtimeJwt } from "@/lib/supabase/mint-student-realtime-jwt";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId query parameter is required." }, { status: 400 });
  }

  const jwtSecret = getSupabaseJwtSecret();
  if (!jwtSecret) {
    return NextResponse.json(
      {
        error:
          "Realtime is not configured. Set SUPABASE_JWT_SECRET (Project Settings → API → JWT Secret) on the server.",
      },
      { status: 503 },
    );
  }

  if (!liveSessionId?.trim()) {
    return NextResponse.json({ error: "Session id is required." }, { status: 400 });
  }

  try {
    const token = mintStudentRealtimeJwt(deviceId, jwtSecret);
    return NextResponse.json({ token, liveSessionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not issue realtime token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
