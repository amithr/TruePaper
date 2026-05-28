import { NextResponse } from "next/server";

import { buildSessionExamBundlePdf, safeFilenameSlug } from "@/lib/exam-pdf";
import { loadAllStudentsForPdf, loadSessionForPdf } from "@/lib/exam-pdf-load";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/** Download every student's exam from a live session as a single PDF bundle. */
export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId } = await params;
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

  let students;
  try {
    students = await loadAllStudentsForPdf(supabase, liveSessionId, loaded.form);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load students." },
      { status: 500 },
    );
  }

  const pdf = await buildSessionExamBundlePdf({
    session: loaded.session,
    form: loaded.form,
    students,
  });

  const formSlug = safeFilenameSlug(loaded.session.formTitle, "exam");
  const codeSlug = safeFilenameSlug(loaded.session.joinCode, "session");
  const filename = `${formSlug}-${codeSlug}-all-students.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
