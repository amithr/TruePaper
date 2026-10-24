import { NextResponse } from "next/server";

import { validatePasswordStrength } from "@/lib/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  password?: string;
  confirmPassword?: string;
};

/** /reset-password: set a new password for the recovery session from the email link. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Password and confirm password do not match." }, { status: 400 });
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "That reset link has expired. Request a new one." }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
