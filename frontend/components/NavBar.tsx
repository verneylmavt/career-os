"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/discover", label: "Discover" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/resume", label: "Resume" },
  { href: "/interview", label: "Interview" },
];

export function NavBar() {
  const path = usePathname();
  return (
    <nav className="border-b border-ink-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-white text-xs font-bold">C</span>
          <span className="text-base font-semibold tracking-tight">CareerOS</span>
        </Link>
        <ul className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                    (active
                      ? "bg-ink-900 text-white"
                      : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")
                  }
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
