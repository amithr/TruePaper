import type { NextRequest } from "next/server";

/** Supabase SSR auth cookies are named `sb-<projectRef>-auth-token[.N]`. */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

export function requestHasSupabaseAuthCookie(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      return true;
    }
  }
  return false;
}

export function documentHasSupabaseAuthCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split(";").some((part) => {
    const name = part.trim().split("=")[0] ?? "";
    return isSupabaseAuthCookieName(name);
  });
}
