type Profile = { display_name: string | null } | null;

export function dashboardWelcomeName(profile: Profile, email: string | null | undefined): string {
  const trimmed = profile?.display_name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (email) {
    return email.split("@")[0] ?? "there";
  }
  return "there";
}
