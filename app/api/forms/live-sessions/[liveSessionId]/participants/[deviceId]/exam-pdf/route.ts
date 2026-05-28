import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { loadSessionForPdf, loadStudentForPdf } from "@/lib/exam-pdf-load";
import { buildSingleStudentExamPdf, safeFilenameSlug } from "@/lib/exam-pdf";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

/** Download one student's exam (answers + feedback + score) as a PDF. */
export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();

  if (!isValidAnonymousSessionId(deviceId)) {
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

  let student;
  try {
    student = await loadStudentForPdf(supabase, liveSessionId, deviceId, loaded.form);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load student exam." },
      { status: 500 },
    );
  }
  if (!student) {
    return NextResponse.json({ error: "This student has not joined the session." }, { status: 404 });
  }

  const pdf = await buildSingleStudentExamPdf({
    session: loaded.session,
    form: loaded.form,
    student,
  });

  const nameSlug = safeFilenameSlug(student.displayName, "student");
  const formSlug = safeFilenameSlug(loaded.session.formTitle, "exam");
  const filename = `${formSlug}-${nameSlug}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
