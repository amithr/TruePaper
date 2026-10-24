import type { SupabaseClient, User } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/is-missing-db-column";

export type Profile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
  /** Public URL of the profile photo (Settings → Profile), if any. */
  avatar_url: string | null;
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

  let profile: { id: string; role: string; display_name: string | null; avatar_url?: string | null } | null = null;
  const withAvatar = await supabase
    .from("profiles")
    .select("id, role, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (withAvatar.error && isMissingColumnError(withAvatar.error, "avatar_url")) {
    // Pre-migration database: no photos yet.
    const legacy = await supabase.from("profiles").select("id, role, display_name").eq("id", user.id).maybeSingle();
    profile = legacy.data;
  } else {
    profile = withAvatar.data;
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
    },
  };
}
