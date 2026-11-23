"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType, type ReactNode } from "react";
import { applyStreakFreezes } from "@/lib/game/storage";
import { CoinBadge } from "./game/GamePanel";
import { BookIcon, GearIcon, GuideIcon, PathIcon, RepeatIcon, SearchBookIcon } from "./icons";
import { useDueCount } from "@/lib/review";
import { TranslateIcon } from "./translate/TranslateIcon";
import { Logo } from "./Logo";
import { ProfileIcon } from "./profile/ProfileIcon";
import { GoalRing, StreakBadge } from "./Stats";

interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  /** Left out of the phone tab bar (five tabs fit legibly at 360px); still in the wide-screen nav. */
  wideOnly?: boolean;
  Icon: ComponentType;
}

const NAV: NavItem[] = [
  { href: "/", label: "Learn", Icon: PathIcon },
  { href: "/practice", label: "Practice", Icon: RepeatIcon },
  { href: "/words", label: "My words", short: "Words", Icon: BookIcon },
  { href: "/guide", label: "Guide", Icon: GuideIcon },
  { href: "/translate", label: "Translate", Icon: TranslateIcon },
  // On phones the Translate page links to the full dictionary ("Browse all ... words").
  { href: "/dictionary", label: "Dictionary", short: "Dictionary", Icon: SearchBookIcon, wideOnly: true },
];
const PROFILE: NavItem = { href: "/profile", label: "Profile", Icon: ProfileIcon };
const SETTINGS: NavItem = { href: "/settings", label: "Settings", Icon: GearIcon };

/** Small count pill; renders nothing at 0 (which is also the SSR / first-render value). */
function DueBadge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[0.6875rem] leading-5 font-black text-white ${className}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function dueLabel(label: string, n: number) {
  return n > 0 ? `${label}, ${n} ${n === 1 ? "word" : "words"} to review` : label;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Chrome shared by the non-lesson screens: sticky header with streak + daily
 * goal, inline nav on wide screens and a bottom tab bar on phones (Settings
 * moves to a header button there and Dictionary is reached from Translate,
 * keeping the bar to five tabs).
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
  const due = useDueCount();
  // Spend held streak freezes on days missed since the last visit (idempotent).
  useEffect(() => {
    applyStreakFreezes();
  }, []);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-surface px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b-2 border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-[var(--header-core)] max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl" aria-label="BanglaLingo home">
            <Logo />
            <span className="text-xl font-black tracking-tight text-brand-dark max-[400px]:hidden">
              BanglaLingo
            </span>
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-0.5">
              {[...NAV, PROFILE, SETTINGS].map((item) => (
                <li key={item.href}>
                  <TopLink
                    item={item}
                    active={isActive(pathname, item.href)}
                    due={item.href === "/practice" ? due : 0}
                    compact={item === PROFILE || item === SETTINGS}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1 min-[400px]:gap-2">
            <CoinBadge />
            <StreakBadge />
            <Link href="/settings#goal" className="flex h-11 w-11 items-center justify-center rounded-full" aria-label="Daily goal settings">
              <GoalRing size={38} />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              aria-current={isActive(pathname, "/profile") ? "page" : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-xl md:hidden ${
                isActive(pathname, "/profile") ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-sunk"
              }`}
            >
              <ProfileIcon />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={isActive(pathname, "/settings") ? "page" : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-xl md:hidden ${
                isActive(pathname, "/settings") ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-sunk"
              }`}
            >
              <GearIcon />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 justify-center gap-10 px-4">
        <main id="main" className="w-full max-w-xl flex-1 pt-6 pb-32 md:pb-16">
          {children}
        </main>
        {aside && (
          <aside className="sticky top-[calc(var(--header-h)+1.5rem)] hidden max-h-[calc(100dvh-var(--header-h)-1.5rem)] w-72 shrink-0 self-start overflow-y-auto overscroll-contain pt-6 pb-6 lg:block">{aside}</aside>
        )}
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.filter((item) => !item.wideOnly).map(({ href, label, short, Icon }) => {
            // The dictionary is opened from Translate on phones, so that tab stays lit there.
            const active = isActive(pathname, href) || (href === "/translate" && isActive(pathname, "/dictionary"));
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={href === "/practice" ? dueLabel(label, due) : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[0.6875rem] font-extrabold transition-colors ${
                    active ? "text-brand-dark" : "text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className={`relative rounded-xl px-3.5 py-1 transition-colors ${active ? "bg-brand-light" : ""}`}
                  >
                    <Icon />
                    {href === "/practice" && <DueBadge n={due} className="absolute -top-1 -right-0.5 ring-2 ring-surface" />}
                  </span>
                  {short ?? label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** `compact`: icon only until very wide screens, so seven links fit one row at 1280px. */
function TopLink({ item, active, due, compact = false }: { item: NavItem; active: boolean; due: number; compact?: boolean }) {
  const { href, label, Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={dueLabel(label, due)}
      title={label}
      className={`flex items-center gap-2 rounded-xl px-2.5 py-2 font-extrabold transition-colors ${
        active ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-sunk hover:text-ink"
      }`}
    >
      <Icon />
      <span className={`hidden whitespace-nowrap ${compact ? "2xl:inline" : "xl:inline"}`}>{label}</span>
      <DueBadge n={due} />
    </Link>
  );
}
