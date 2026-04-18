import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type UpdateFormBody = {
  title?: string;
  description?: string;
};

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { formId } = await params;
  const body = (await request.json()) as UpdateFormBody;
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("forms")
    .update({ title, description: description ?? "" })
    .eq("id", formId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
