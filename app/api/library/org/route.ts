import { NextResponse } from "next/server";

import type { TeacherOrgProfile } from "@/lib/library/types";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("organization_id, department_id, org_role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let organizationName: string | null = null;
  let departmentName: string | null = null;

  if (profile?.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .maybeSingle();
    organizationName = org?.name ?? null;
  }
  if (profile?.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("name")
      .eq("id", profile.department_id)
      .maybeSingle();
    departmentName = dept?.name ?? null;
  }

  const { data: orgs } = await supabase.from("organizations").select("id, name").order("name");
  const { data: departments } = profile?.organization_id
    ? await supabase
        .from("departments")
        .select("id, name, organization_id")
        .eq("organization_id", profile.organization_id)
        .order("name")
    : { data: [] };

  return NextResponse.json({
    profile: {
      organizationId: profile?.organization_id ?? null,
      organizationName,
      departmentId: profile?.department_id ?? null,
      departmentName,
      orgRole: profile?.org_role ?? "member",
    } satisfies TeacherOrgProfile,
    organizations: orgs ?? [],
    departments: departments ?? [],
  });
}

type PatchBody = {
  organizationId?: string | null;
  departmentId?: string | null;
};

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as PatchBody;
  const organizationId = body.organizationId ?? null;
  let departmentId = body.departmentId ?? null;

  if (departmentId && organizationId) {
    const { data: dept } = await supabase
      .from("departments")
      .select("id")
      .eq("id", departmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!dept) {
      return NextResponse.json({ error: "Department not found in school." }, { status: 400 });
    }
  } else if (departmentId && !organizationId) {
    departmentId = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      organization_id: organizationId,
      department_id: departmentId,
    })
    .eq("id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
