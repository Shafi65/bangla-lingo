"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookIcon, GearIcon, PathIcon, RepeatIcon } from "./icons";
import { Logo } from "./Logo";
import { GoalRing, StreakBadge } from "./Stats";

const NAV = [
  { href: "/", label: "Learn", Icon: PathIcon },
  { href: "/practice", label: "Practice", Icon: RepeatIcon },
  { href: "/words", label: "My words", Icon: BookIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
] as const;

/**
 * Chrome shared by the non-lesson screens: sticky header with streak + daily
 * goal, inline nav on wide screens and a bottom tab bar on phones.
 */
export function AppShell({
  children,
  aside,
}: {
  children: ReactNode;
  /** Optional right-hand column on wide screens. */
  aside?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-white px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b-2 border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 rounded-xl" aria-label="BanglaLingo home">
            <Logo />
            <span className="text-xl font-black tracking-tight text-brand-dark">
              BanglaLingo
            </span>
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 font-extrabold transition ${
                        active ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-gray-100 hover:text-ink"
                      }`}
                    >
                      <Icon />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex items-center gap-4">
            <StreakBadge />
            <Link href="/settings#goal" className="rounded-full" aria-label="Daily goal settings">
              <GoalRing size={38} />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 justify-center gap-10 px-4">
        <main id="main" className="w-full max-w-xl flex-1 pt-6 pb-28 md:pb-16">
          {children}
        </main>
        {aside && (
          <aside className="sticky top-20 hidden w-72 shrink-0 self-start pt-6 lg:block">{aside}</aside>
        )}
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-xs font-extrabold ${
                    active ? "text-brand-dark" : "text-muted"
                  }`}
                >
                  <span className={`rounded-xl px-4 py-1 ${active ? "bg-brand-light" : ""}`}>
                    <Icon />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
