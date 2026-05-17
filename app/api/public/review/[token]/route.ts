import { NextResponse } from "next/server";

import { parseStudentReviewPayload } from "@/lib/parse-student-review";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken).trim().toUpperCase();

  if (token.length < 8) {
    return NextResponse.json({ error: "Invalid review link." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("get_student_review_by_token", {
      p_token: token,
    });

    if (error) {
      if (error.message.includes("get_student_review_by_token") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing get_student_review_by_token. Run migration 20260518100000_student_review_share.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const review = parseStudentReviewPayload(data);
    if (!review) {
      return NextResponse.json({ error: "Review link not found." }, { status: 404 });
    }

    return NextResponse.json({ review });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
