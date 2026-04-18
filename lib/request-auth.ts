import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .maybeSingle();

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
    },
  };
}
