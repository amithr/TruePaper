"use client";

import Link from "next/link";

import { buttonLabel, ui } from "@/lib/ui";

export type TeacherNavActive = "dashboard" | "join" | "none";

type Props = {
  active: TeacherNavActive;
};

export function TeacherAppNav({ active }: Props) {
  return (
    <nav aria-label="Teacher navigation" className="flex flex-wrap gap-2">
      <Link href="/dashboard" className={active === "dashboard" ? ui.pillActive : ui.pill}>
        {buttonLabel("Form library")}
      </Link>
      <Link href="/#join-session" className={active === "join" ? ui.pillActive : ui.pill}>
        {buttonLabel("Student join")}
      </Link>
    </nav>
  );
}
