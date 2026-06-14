import { NextResponse } from "next/server";

/** Lightweight reachability check for student offline UX (no auth). */
export async function GET() {
  return NextResponse.json({ ok: true });
}
