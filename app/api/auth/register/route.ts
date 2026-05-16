import { NextResponse } from "next/server";

import {
  isValidLiveSessionDisplayName,
  normalizeLiveSessionDisplayName,
} from "@/lib/live-session-display-name";
import { validatePasswordStrength } from "@/lib/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  displayName?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";
  const displayName = normalizeLiveSessionDisplayName(body.displayName ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (!isValidLiveSessionDisplayName(displayName)) {
    return NextResponse.json(
      { error: "Your name is required (1–120 characters)." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Password and confirm password do not match." }, { status: 400 });
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const requestUrl = new URL(request.url);
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;
  const emailRedirectTo = `${origin}/auth/callback?next=/dashboard`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        role: "teacher",
        display_name: displayName,
      },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
    needsEmailConfirmation: !data.session,
  });
}
