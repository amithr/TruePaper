import { NextResponse } from "next/server";

type Params = {
  params: Promise<{ formId: string }>;
};

/** Replaced by `/api/public/live-sessions/[liveSessionId]/responses` (join-code sessions). */
export async function GET(_request: Request, _context: Params) {
  return NextResponse.json(
    {
      error:
        "This endpoint is no longer used. Join with your session code, then save answers on the live session responses route.",
    },
    { status: 410 },
  );
}

export async function PUT(_request: Request, _context: Params) {
  return NextResponse.json(
    {
      error:
        "This endpoint is no longer used. Join with your session code, then save answers on the live session responses route.",
    },
    { status: 410 },
  );
}
