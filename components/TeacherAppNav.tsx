"use client";

import Link from "next/link";

const inactive =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";
const active =
  "rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

export type TeacherNavActive = "dashboard" | "join" | "none";

type Props = {
  active: TeacherNavActive;
};

export function TeacherAppNav({ active }: Props) {
  return (
    <nav aria-label="Teacher navigation" className="flex flex-wrap gap-2">
      <Link href="/dashboard" className={active === "dashboard" ? active : inactive}>
        Form library
      </Link>
      <Link href="/#join-session" className={active === "join" ? active : inactive}>
        Student join
      </Link>
    </nav>
  );
}
