import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import {
  loadAllStudentsForPdf,
  loadSessionForPdf,
  loadStudentForPdf,
} from "@/lib/exam-pdf-load";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/**
 * JSON payload for client-side exam PDF generation: session, form (with
 * questions), and students (all, or one via `?deviceId=`). Teacher-only —
 * same auth as the server PDF routes, which remain as a fallback.
 */
export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const deviceIdParam = new URL(request.url).searchParams.get("deviceId");
  const deviceId = deviceIdParam ? deviceIdParam.trim().toLowerCase() : null;

  if (deviceId !== null && !isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can download exams." }, { status: 403 });
  }

  let loaded;
  try {
    loaded = await loadSessionForPdf(supabase, session.user.id, liveSessionId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load session." },
      { status: 500 },
    );
  }
  if (!loaded) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    if (deviceId) {
      const student = await loadStudentForPdf(supabase, liveSessionId, deviceId, loaded.form);
      if (!student) {
        return NextResponse.json(
          { error: "This student has not joined the session." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { session: loaded.session, form: loaded.form, students: [student] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const students = await loadAllStudentsForPdf(supabase, liveSessionId, loaded.form);
    return NextResponse.json(
      { session: loaded.session, form: loaded.form, students },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load students." },
      { status: 500 },
    );
  }
}
