import { NextResponse } from "next/server";

/** Anonymous students join with a teacher-issued code; forms are not publicly listed. */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "Public form listing is disabled. Students should open the app and enter the 6-character session code from their teacher.",
    },
    { status: 404 },
  );
}
