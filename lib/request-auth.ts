import type { SupabaseClient, User } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/is-missing-db-column";

export type Profile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
  /** Public URL of the profile photo (Settings → Profile), if any. */
  avatar_url: string | null;
  /** Admin area access (Admin → Users can grant it). */
  is_admin: boolean;
};

export async function getSessionUser(
  supabase: SupabaseClient,
): Promise<{ user: User; profile: Profile | null } | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Columns arrive with migrations (avatar_url, then is_admin); fall back column by
  // column so a database that is behind still signs teachers in.
  type ProfileRow = { id: string; role: string; display_name: string | null; avatar_url?: string | null; is_admin?: boolean | null };
  let profile: ProfileRow | null = null;
  const selects = ["id, role, display_name, avatar_url, is_admin", "id, role, display_name, avatar_url", "id, role, display_name"];
  for (const columns of selects) {
    const res = await supabase.from("profiles").select(columns).eq("id", user.id).maybeSingle();
    if (!res.error) {
      profile = res.data as ProfileRow | null;
      break;
    }
    if (!isMissingColumnError(res.error, "is_admin") && !isMissingColumnError(res.error, "avatar_url")) {
      break;
    }
  }

  if (!profile) {
    return { user, profile: null };
  }

  const role = profile.role === "teacher" ? "teacher" : "student";

  return {
    user,
    profile: {
      id: profile.id,
      role,
      display_name: profile.display_name,
      avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
      is_admin: profile.is_admin === true,
    },
  };
}
