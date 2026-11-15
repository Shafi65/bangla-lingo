import type { Achievement } from "@/lib/profile";
import { Badge } from "./Badge";

/** Badge grid: earned ones in thread colours, locked ones grey with what is still needed. */
export function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earned).length;
  return (
    <section aria-labelledby="ach-h" className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ach-h" className="text-xl font-black">
          Achievements
        </h2>
        <p className="text-sm font-bold text-muted">
          {earned} of {list.length} earned
        </p>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 min-[440px]:grid-cols-3 sm:grid-cols-4">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col items-center text-center">
            <div className={a.earned ? "" : "opacity-90"}>
              <Badge motif={a.motif} tone={a.tone} tier={a.tier} earned={a.earned} />
            </div>
            <p className={`mt-1.5 leading-tight font-black ${a.earned ? "text-ink" : "text-muted"}`}>
              {a.title}
              <span className="sr-only">{a.earned ? ", earned" : ", locked"}</span>
            </p>
            <p className="mt-0.5 max-w-[11rem] text-xs leading-snug font-semibold text-muted">
              {a.goal}
            </p>
            {!a.earned && (
              <div className="mt-2 w-full max-w-[8.5rem]">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-sunk"
                  role="progressbar"
                  aria-label={`${a.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={a.target}
                  aria-valuenow={a.value}
                  aria-valuetext={a.progressText}
                >
                  <div
                    className="h-full rounded-full bg-muted/60"
                    style={{ width: `${a.target ? Math.round((a.value / a.target) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.6875rem] leading-tight font-bold text-muted">{a.progressText}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
