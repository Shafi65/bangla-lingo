"use client";

import Link from "next/link";
import { SpeakButton } from "../SpeakButton";
import { Translit } from "../Translit";
import type { CourseResult, Hit } from "@/lib/translate/search";
import type { TItem, TranslateData } from "@/lib/translate/types";

function Source({ item, data }: { item: TItem; data: TranslateData }) {
  const lesson = item.l ? data.lessons[item.l] : undefined;
  if (lesson) {
    const unit = data.units[lesson.u];
    return (
      <Link
        href={`/guide/${unit.id}#${item.l}`}
        className="font-bold text-brand-dark underline decoration-2 underline-offset-2 hover:decoration-brand"
      >
        {item.s ? "Example from" : "Taught in"} {lesson.t}
      </Link>
    );
  }
  if (item.a) return <span className="font-semibold text-muted">Used in later lessons</span>;
  return null;
}

function HitCard({ hit, data, featured }: { hit: Hit; data: TranslateData; featured: boolean }) {
  const { item } = hit;
  return (
    <li
      className={`rounded-[var(--radius-card)] border-2 p-4 ${
        featured ? "border-brand/25 bg-brand-light/60 dark:border-brand/40" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            lang="bn"
            className={`bn-display font-semibold break-words text-ink ${
              featured ? "text-[2.5rem] sm:text-5xl" : item.s ? "text-2xl" : "text-3xl"
            }`}
          >
            {item.bn}
          </p>
          <p className={featured ? "mt-1 text-lg" : "text-base"}>
            <Translit tr={item.tr} />
          </p>
          <p className={`font-extrabold text-ink ${featured ? "mt-2 text-xl" : "mt-1 text-lg"}`}>{item.en}</p>
          {item.alt && item.alt.length > 0 && !item.s && (
            <p className="text-sm font-semibold text-muted">Also: {item.alt.join(", ")}</p>
          )}
          {item.kb && (
            <p className="mt-2 text-sm font-semibold text-ink/85">
              In Kolkata: <span lang="bn" className="text-base">{item.kb}</span>
              {item.kt && <span className="text-muted italic"> {item.kt}</span>}
            </p>
          )}
          {item.n && <p className="mt-1 text-sm font-semibold text-muted">{item.n}</p>}
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {item.pos && (
              <span className="rounded-full bg-sunk px-2.5 py-0.5 text-xs font-extrabold text-muted">{item.pos}</span>
            )}
            <Source item={item} data={data} />
          </p>
        </div>
        <SpeakButton bn={item.bn} size={featured ? "md" : "sm"} className="mt-1" />
      </div>
    </li>
  );
}

export function CourseResults({ result, data }: { result: CourseResult; data: TranslateData }) {
  if (result.kind === "empty") return null;

  if (result.kind === "words") {
    return (
      <section aria-labelledby="course-heading" className="mt-6">
        <h2 id="course-heading" className="text-lg font-black">
          From the course, word by word
        </h2>
        <p className="text-sm font-semibold text-muted">
          No lesson has this exact phrase. Here is each word on its own.
        </p>
        <ul className="mt-3 space-y-2">
          {result.words.map(({ word, hit }) =>
            hit ? (
              <li key={word} className="rounded-[var(--radius-card)] border-2 border-line bg-surface p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-muted">
                      <span lang={/[\u0980-\u09FF]/.test(word) ? "bn" : undefined}>{word}</span>
                      <span aria-hidden> =</span>
                      <span className="sr-only"> is</span>
                    </p>
                    <p lang="bn" className="bn-display text-2xl font-semibold break-words">
                      {hit.item.bn}
                    </p>
                    <p className="text-base">
                      <Translit tr={hit.item.tr} />
                    </p>
                    <p className="font-bold">{hit.item.en}</p>
                    <p className="mt-1 text-sm">
                      <Source item={hit.item} data={data} />
                    </p>
                  </div>
                  <SpeakButton bn={hit.item.bn} size="sm" className="mt-1" />
                </div>
              </li>
            ) : (
              <li
                key={word}
                className="rounded-[var(--radius-card)] border-2 border-dashed border-line px-3 py-2 text-sm font-semibold text-muted"
              >
                <span className="font-extrabold text-ink">{word}</span>: not in the course yet
              </li>
            ),
          )}
        </ul>
      </section>
    );
  }

  if (result.hits.length === 0) {
    return (
      <section className="mt-6 rounded-[var(--radius-card)] border-2 border-dashed border-line-strong p-4">
        <h2 className="text-lg font-black">Not in the course yet</h2>
        <p className="mt-1 font-semibold text-muted">
          Check the spelling, try a single word, or press Translate for a machine translation.
        </p>
      </section>
    );
  }

  const featured = result.hits[0].tier === 0 ? result.hits[0] : undefined;
  const rest = featured ? result.hits.slice(1) : result.hits;
  const words = rest.filter((h) => !h.item.s);
  const sentences = rest.filter((h) => h.item.s);
  return (
    <section aria-labelledby="course-heading" className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="course-heading" className="text-lg font-black">
          From the course
        </h2>
        {result.total > result.hits.length && (
          <span className="text-sm font-bold text-muted">
            Best {result.hits.length} of {result.total}
          </span>
        )}
      </div>
      {(featured || words.length > 0) && (
        <ul className="mt-3 space-y-2">
          {featured && <HitCard hit={featured} data={data} featured />}
          {words.map((h) => (
            <HitCard key={h.i} hit={h} data={data} featured={false} />
          ))}
        </ul>
      )}
      {sentences.length > 0 && (
        <>
          <h3 className="mt-5 text-base font-black">In lesson sentences</h3>
          <ul className="mt-2 divide-y-2 divide-line overflow-hidden rounded-[var(--radius-card)] border-2 border-line bg-surface">
            {sentences.map(({ i, item }) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p lang="bn" className="text-xl font-semibold break-words text-ink">
                    {item.bn}
                  </p>
                  <p className="text-sm">
                    <Translit tr={item.tr} />
                  </p>
                  <p className="font-bold text-ink">{item.en}</p>
                  <p className="mt-1 text-sm">
                    <Source item={item} data={data} />
                  </p>
                </div>
                <SpeakButton bn={item.bn} size="sm" className="mt-1" />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
