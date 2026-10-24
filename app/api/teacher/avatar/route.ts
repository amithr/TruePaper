import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AVATARS_BUCKET,
  avatarPublicUrl,
  avatarStoragePath,
  isAllowedAvatarMime,
  MAX_AVATAR_BYTES,
} from "@/lib/teacher-avatar";

const MIGRATION_HINT = "Run migration 20261023130000_teacher_settings.sql.";

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (session.profile?.role !== "teacher") {
    return { error: NextResponse.json({ error: "Only teachers have a profile photo." }, { status: 403 }) };
  }
  return { supabase, userId: session.user.id };
}

/** Upload (or replace) the teacher's profile photo. Multipart: `file`. */
export async function POST(request: Request) {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase, userId } = auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Photo must be 2 MB or smaller." }, { status: 400 });
  }
  if (!isAllowedAvatarMime(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  }

  const path = avatarStoragePath(userId, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) {
    const missingBucket = /bucket/i.test(uploadError.message) && /not found/i.test(uploadError.message);
    return NextResponse.json(
      { error: missingBucket ? `Storage bucket "avatars" is missing. ${MIGRATION_HINT}` : uploadError.message },
      { status: missingBucket ? 503 : 500 },
    );
  }

  const url = avatarPublicUrl(path);
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (error) {
    if (isMissingColumnError(error, "avatar_url")) {
      return NextResponse.json(
        { error: `Database is missing profiles.avatar_url. ${MIGRATION_HINT}` },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatarUrl: url });
}

/** Remove the photo: clears `profiles.avatar_url` and deletes the object. */
export async function DELETE() {
  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase, userId } = auth;

  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error && !isMissingColumnError(error, "avatar_url")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: objects } = await supabase.storage.from(AVATARS_BUCKET).list(userId);
  const paths = (objects ?? []).map((o) => `${userId}/${o.name}`);
  if (paths.length > 0) {
    await supabase.storage.from(AVATARS_BUCKET).remove(paths);
  }

  return NextResponse.json({ ok: true });
}
