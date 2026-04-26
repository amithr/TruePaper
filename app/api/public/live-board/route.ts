import { NextResponse } from "next/server";

import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { parseLivePublicBoardRpc } from "@/lib/live-public-board";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";
  const code = normalizeJoinCode(raw);

  if (!isValidJoinCodeFormat(code)) {
    return NextResponse.json({ error: "A valid 6-character join code is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("get_live_session_public_board", { p_code: code });

    if (error) {
      if (error.message.includes("get_live_session_public_board") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing get_live_session_public_board. Run migration 20260424100000_live_session_public_board.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const raw = data as Record<string, unknown>;
    if (raw.ok !== true) {
      const reason = typeof raw.reason === "string" ? raw.reason : "session_closed";
      const status = reason === "invalid_code" ? 400 : 404;
      return NextResponse.json({ error: "This session is not available.", reason }, { status });
    }

    const parsed = parseLivePublicBoardRpc(data);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid board payload." }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
