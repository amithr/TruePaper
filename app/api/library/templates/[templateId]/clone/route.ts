import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ templateId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can clone templates." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("clone_library_template", {
    p_template_id: templateId,
  });

  if (error) {
    if (error.message.includes("clone_library_template") || error.code === "42883") {
      return NextResponse.json(
        { error: "Run migration 20260605140000_template_library.sql." },
        { status: 503 },
      );
    }
    if (error.message.includes("not allowed") || error.message.includes("not found")) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { formId: string; templateId: string; clonedAtVersion: number };
  return NextResponse.json({
    formId: result.formId,
    templateId: result.templateId,
    clonedAtVersion: result.clonedAtVersion,
  });
}
