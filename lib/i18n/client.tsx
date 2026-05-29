"use client";

import NextLink, { type LinkProps } from "next/link";
import { useRouter as useNextRouter } from "next/navigation";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

import { useLocale } from "@/lib/i18n/I18nProvider";
import { localizeHref } from "@/lib/i18n/navigation";

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

type LocaleLinkProps = AnchorProps &
  Omit<LinkProps, "href"> & {
    href: string;
    children?: ReactNode;
  };

/**
 * Drop-in replacement for `next/link`'s default export that auto-prepends the
 * current locale to internal hrefs. External URLs and absolute schemes pass
 * through unchanged.
 */
export const LocaleLink = forwardRef<HTMLAnchorElement, LocaleLinkProps>(function LocaleLink(
  { href, children, ...rest },
  ref,
) {
  const locale = useLocale();
  return (
    <NextLink ref={ref} href={localizeHref(href, locale)} {...rest}>
      {children}
    </NextLink>
  );
});

/**
 * Locale-aware wrapper around `useRouter` from `next/navigation`. Calls to
 * `push` / `replace` are auto-prefixed with the current locale; `refresh`,
 * `back`, `forward`, and `prefetch` pass through.
 */
export function useLocaleRouter() {
  const locale = useLocale();
  const router = useNextRouter();
  return {
    push: (href: string) => router.push(localizeHref(href, locale)),
    replace: (href: string) => router.replace(localizeHref(href, locale)),
    refresh: () => router.refresh(),
    back: () => router.back(),
    forward: () => router.forward(),
    prefetch: (href: string) => router.prefetch(localizeHref(href, locale)),
  };
}
