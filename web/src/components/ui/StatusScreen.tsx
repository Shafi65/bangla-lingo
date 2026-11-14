import type { ReactNode } from "react";

/**
 * Full-screen message for 404s and errors: a large Bengali word as the
 * illustration, a plain-English heading, one line of direction and actions.
 */
export function StatusScreen({
  bn,
  bnGloss,
  title,
  children,
  actions,
}: {
  bn: string;
  /** Pronunciation and meaning of `bn`, shown small under it. */
  bnGloss: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-5 bg-paper px-6 py-12 text-center">
      <div className="kantha-edge flex h-36 min-w-36 items-center justify-center rounded-full bg-brand-light px-10 [--radius-panel:9999px] [--stitch:color-mix(in_oklab,var(--color-brand)_40%,transparent)]">
        <span lang="bn" className="bn-display text-5xl font-bold text-brand-dark">
          {bn}
        </span>
      </div>
      <p className="-mt-2 text-sm font-semibold text-muted italic">{bnGloss}</p>
      <h1 className="text-2xl font-black text-balance text-ink sm:text-3xl">{title}</h1>
      {children && <div className="max-w-sm font-semibold text-pretty text-muted">{children}</div>}
      <div className="mt-2 flex w-full max-w-xs flex-col gap-3">{actions}</div>
    </main>
  );
}

/** Placeholder blocks while a screen loads. */
export function SkeletonScreen({ variant = "page" }: { variant?: "page" | "lesson" }) {
  if (variant === "lesson") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-surface px-4 pt-6" aria-busy="true" aria-label="Loading lesson">
        <div className="flex items-center gap-4">
          <div className="skeleton h-10 w-10" />
          <div className="skeleton h-4 flex-1 rounded-full!" />
          <div className="skeleton h-8 w-10" />
        </div>
        <div className="skeleton mt-4 h-8 w-3/4" />
        <div className="skeleton h-16 w-1/2" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-paper px-4 pt-20" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-36 w-full" />
      <div className="skeleton h-6 w-1/3" />
      <div className="skeleton h-28 w-full" />
      <div className="skeleton h-28 w-full" />
    </div>
  );
}
