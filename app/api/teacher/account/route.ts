import { NextResponse } from "next/server";

import { FORM_ASSETS_BUCKET } from "@/lib/form-assets";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET } from "@/lib/teacher-avatar";

type Body = {
  /** The UI makes the teacher type a word; the API still wants an explicit flag. */
  confirm?: boolean;
};

type StorageClient = Awaited<ReturnType<typeof createSupabaseServerClient>>["storage"];

/**
 * Storage has no cascade: remove every object under `{userId}/` in a bucket.
 * Objects live at most one folder deep (`{userId}/{formId}/x.jpg`, `{userId}/avatar.jpg`).
 */
async function removeOwnedObjects(storage: StorageClient, bucket: string, userId: string): Promise<void> {
  const { data: top } = await storage.from(bucket).list(userId, { limit: 1000 });
  const paths: string[] = [];
  for (const entry of top ?? []) {
    if (entry.id) {
      paths.push(`${userId}/${entry.name}`);
      continue;
    }
    // A folder: list its files.
    const { data: inner } = await storage.from(bucket).list(`${userId}/${entry.name}`, { limit: 1000 });
    for (const file of inner ?? []) {
      paths.push(`${userId}/${entry.name}/${file.name}`);
    }
  }
  if (paths.length > 0) {
    await storage.from(bucket).remove(paths);
  }
}

/**
 * Settings → Danger zone. Deletes the teacher's storage objects, then runs
 * `delete_my_account()` (forms, sessions, submissions, then the auth user).
 */
export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete their account here." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirmation is required." }, { status: 400 });
  }

  const userId = session.user.id;
  try {
    await removeOwnedObjects(supabase.storage, FORM_ASSETS_BUCKET, userId);
    await removeOwnedObjects(supabase.storage, AVATARS_BUCKET, userId);
  } catch {
    /* best effort — orphaned objects are harmless and the account still goes */
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.message.includes("delete_my_account") || error.code === "42883") {
      return NextResponse.json(
        { error: "Database is missing delete_my_account. Run migration 20261023130000_teacher_settings.sql." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The user no longer exists; clear the cookies so the browser isn't left with a dead session.
  await supabase.auth.signOut().catch(() => undefined);

  return NextResponse.json({ ok: true });
}
