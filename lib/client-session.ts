import type { User } from "@supabase/supabase-js";

import type { Profile } from "@/lib/request-auth";

export type ClientSessionUser = { id: string; email?: string | null };
export type ClientSessionProfile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
};
export type ClientSessionData = {
  user: ClientSessionUser;
  profile: ClientSessionProfile | null;
};

export function toClientSessionData(session: {
  user: User;
  profile: Profile | null;
}): ClientSessionData {
  return {
    user: { id: session.user.id, email: session.user.email },
    profile: session.profile
      ? {
          id: session.profile.id,
          role: session.profile.role,
          display_name: session.profile.display_name,
        }
      : null,
  };
}
