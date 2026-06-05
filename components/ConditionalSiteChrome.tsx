"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { BODY_FOCUS_ATTR, isFocusPath } from "@/lib/focus-mode";

function hasBodyFocusMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.body.hasAttribute(BODY_FOCUS_ATTR);
}

export function ConditionalSiteChrome() {
  const pathname = usePathname();
  const [bodyFocus, setBodyFocus] = useState(false);

  useEffect(() => {
    const sync = () => setBodyFocus(hasBodyFocusMode());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [BODY_FOCUS_ATTR],
    });
    return () => observer.disconnect();
  }, []);

  const hideChrome = isFocusPath(pathname) || bodyFocus;

  if (hideChrome) {
    return null;
  }

  return (
    <>
      <SiteFooter />
      <CookieConsentBanner />
    </>
  );
}
