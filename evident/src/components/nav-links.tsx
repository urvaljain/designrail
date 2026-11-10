"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/app", label: "Today" },
  { href: "/app/jobs", label: "Jobs" },
  { href: "/app/resume", label: "Resume" },
  { href: "/app/applications", label: "Applications" },
  { href: "/app/interview", label: "Interview practice" },
  { href: "/app/roadmap", label: "Skill roadmap" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/activity", label: "Agent activity" },
  { href: "/app/settings", label: "Settings" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="-mx-1 mt-3 lg:mt-6">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {LINKS.map((l) => {
          const active = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm font-medium", active ? "bg-accent-soft text-accent-ink" : "text-ink hover:bg-sunken")}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
