"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  id: string;
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  /** Mount immediately (e.g. while the first-login tour needs its anchors on the page). */
  eager?: boolean;
};

/** Mount children when the section scrolls near the viewport (defers below-the-fold work). */
export function DashboardLazySection({
  id,
  children,
  placeholder = null,
  rootMargin = "240px",
  eager = false,
}: Props) {
  const [visible, setVisible] = useState(eager);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div id={id} ref={ref} className="scroll-mt-6">
      {visible ? children : placeholder}
    </div>
  );
}
