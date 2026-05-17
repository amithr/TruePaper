"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  id: string;
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
};

/** Mount children when the section scrolls near the viewport (defers below-the-fold work). */
export function DashboardLazySection({
  id,
  children,
  placeholder = null,
  rootMargin = "240px",
}: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

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
