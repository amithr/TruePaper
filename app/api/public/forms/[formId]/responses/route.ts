import { NextResponse } from "next/server";

/** Replaced by `/api/public/live-sessions/[liveSessionId]/responses` (join-code sessions). */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "This endpoint is no longer used. Join with your session code, then save answers on the live session responses route.",
    },
    { status: 410 },
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "This endpoint is no longer used. Join with your session code, then save answers on the live session responses route.",
    },
    { status: 410 },
  );
}
