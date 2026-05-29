import { type NextRequest, NextResponse } from "next/server";

import {
  LOCALE_COOKIE,
  LOCALE_EXPLICIT_COOKIE,
  LOCALES,
  isLocale,
  pickLocaleFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n/config";
import { applySupabaseSessionRefresh } from "@/lib/supabase/middleware";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Paths that are NOT localized — API handlers, the OAuth callback, Next.js
 * internals, and static assets. These keep their bare URLs.
 */
function isExcludedFromLocaleRouting(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|map|css|js)$/.test(pathname)) {
    return true;
  }
  return false;
}

/**
 * Cheap path-prefix check used by the locale routing logic. We avoid calling
 * the (more expensive) Supabase refresh on `_next/data`, RSC payload requests,
 * and prefetch hover hits — they don't mutate auth state and the refresh has
 * already happened (or will happen) on a regular navigation.
 */
function isPrefetchOrDataRequest(request: NextRequest, pathname: string): boolean {
  if (pathname.startsWith("/_next/data/")) return true;
  const headers = request.headers;
  // App Router prefetches set a couple of distinct headers depending on type.
  if (headers.get("next-router-prefetch") === "1") return true;
  if (headers.get("purpose") === "prefetch") return true;
  if (headers.get("x-purpose") === "prefetch") return true;
  if (headers.get("x-middleware-prefetch") === "1") return true;
  if (headers.get("rsc") === "1" && headers.get("next-router-state-tree")) return true;
  return false;
}

function firstSegment(pathname: string): string | null {
  const parts = pathname.split("/");
  return parts.length > 1 ? parts[1] ?? null : null;
}

function isExplicitLocaleChoice(request: NextRequest): boolean {
  return request.cookies.get(LOCALE_EXPLICIT_COOKIE)?.value === "1";
}

function isLocalizedHome(pathname: string): Locale | null {
  const seg = firstSegment(pathname);
  if (!seg || !isLocale(seg)) {
    return null;
  }
  const rest = pathname.slice(`/${seg}`.length) || "/";
  return rest === "/" ? seg : null;
}

function preferredLocale(request: NextRequest): Locale {
  const cookieValue = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isExplicitLocaleChoice(request) && isLocale(cookieValue)) {
    return cookieValue;
  }
  return pickLocaleFromAcceptLanguage(request.headers.get("accept-language"));
}

function redirectToLocaleHome(request: NextRequest, locale: Locale): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}`;
  const redirect = NextResponse.redirect(target);
  redirect.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
  return redirect;
}

/**
 * Next.js 16 Proxy: locale routing + Supabase session refresh.
 *
 * Hot-path optimizations:
 *  - Excluded paths (API, OAuth callback, static, `_next/`) skip everything.
 *  - Prefetch / RSC requests skip the Supabase refresh.
 *  - Redirect responses (locale fixup) skip the refresh — the browser will
 *    follow the redirect and the refresh runs on the real request.
 *  - Guests with no Supabase auth cookie skip the refresh inside
 *    `applySupabaseSessionRefresh` itself.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isExcludedFromLocaleRouting(pathname)) {
    if (isPrefetchOrDataRequest(request, pathname)) {
      return NextResponse.next({ request });
    }
    return applySupabaseSessionRefresh(request, NextResponse.next({ request }));
  }

  const seg = firstSegment(pathname);
  if (seg && (LOCALES as readonly string[]).includes(seg)) {
    const homeLocale = isLocalizedHome(pathname);
    if (homeLocale && !isExplicitLocaleChoice(request)) {
      const detected = pickLocaleFromAcceptLanguage(request.headers.get("accept-language"));
      if (detected !== homeLocale) {
        return redirectToLocaleHome(request, detected);
      }
    }

    const baseResponse = NextResponse.next({ request });
    if (request.cookies.get(LOCALE_COOKIE)?.value !== seg) {
      baseResponse.cookies.set(LOCALE_COOKIE, seg, {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        sameSite: "lax",
      });
    }

    if (isPrefetchOrDataRequest(request, pathname)) {
      return baseResponse;
    }
    return applySupabaseSessionRefresh(request, baseResponse);
  }

  const locale = preferredLocale(request);
  if (pathname === "/") {
    return redirectToLocaleHome(request, locale);
  }
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}${pathname}`;
  const redirect = NextResponse.redirect(target);
  redirect.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
  return redirect;
}

export const config = {
  matcher: [
    // Exclude static assets and Next.js framework chunks up-front so the Proxy
    // never even runs for them. Note: we keep `_next/data/` routed here so the
    // locale logic can return early (we don't want a 404 on RSC fetches).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
