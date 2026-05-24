"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="5.5" height="5.5" rx="1.25" fill="currentColor" opacity="0.6" />
        <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.25" fill="currentColor" />
        <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.25" fill="currentColor" />
        <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.25" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    href: "/discover",
    label: "Discover",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/shortlist",
    label: "Shortlist",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <path
          d="M3.5 2h8a1 1 0 011 1v9.5l-4-2.2-4 2.2V3a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/resume",
    label: "Resume",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <rect x="2.5" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5h4M5.5 7.5h4M5.5 10h2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/interview",
    label: "Interview",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <path
          d="M7.5 1C4.46 1 2 3.24 2 6c0 1.36.54 2.6 1.43 3.52L3 14l3.5-1.3c.32.1.65.18 1 .23V13c2.76-.28 4.5-2.26 4.5-5 0-2.76-2.24-5.5-4.5-7z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function NavBar() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-violet-700 text-white text-xs font-bold shadow-sm shadow-accent/30">
            C
          </span>
          <span className="text-sm font-bold tracking-tight text-ink-900">CareerOS</span>
        </Link>

        {/* Nav tabs */}
        <ul className="flex items-center gap-0.5">
          {TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-150 " +
                    (active
                      ? "bg-ink-900 text-white"
                      : "text-ink-500 hover:bg-ink-100 hover:text-ink-900")
                  }
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
