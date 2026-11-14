import Link from "next/link";
import { MiniMarkdown, Inline } from "../lesson/MiniMarkdown";
import { BnText } from "../BnText";
import { WordTable } from "./WordTable";
import type { GuideLesson } from "@/lib/guide/data";

function H({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-5 mb-2 text-sm font-extrabold tracking-wide text-muted uppercase">{children}</h4>;
}

export function LessonSection({ lesson, index }: { lesson: GuideLesson; index: number }) {
  return (
    <section id={lesson.id} aria-labelledby={`${lesson.id}-h`} className="scroll-mt-[calc(var(--header-h)+1rem)] rounded-3xl border-2 border-line bg-surface p-4">
      <p className="text-xs font-extrabold tracking-wide text-brand-dark uppercase">
        {lesson.kind === "lesson" ? `Lesson ${index + 1}` : lesson.kind === "review" ? "Review" : "Checkpoint"}
      </p>
      <h3 id={`${lesson.id}-h`} className="text-2xl font-black">{lesson.title}</h3>
      {lesson.goal && <p className="mt-1 font-semibold text-muted">{lesson.goal}</p>}

      {lesson.grammar.length > 0 && (
        <>
          <H>Grammar</H>
          <ul className="list-disc space-y-1 pl-5 font-semibold">
            {lesson.grammar.map((g, i) => (
              <li key={i}>
                <Inline text={g} />
              </li>
            ))}
          </ul>
        </>
      )}

      {lesson.tip && (
        <div className="mt-5 rounded-2xl border-2 border-brand/20 bg-brand-light p-4 text-base leading-relaxed font-semibold">
          <MiniMarkdown text={lesson.tip} />
        </div>
      )}

      {lesson.words.length > 0 && (
        <>
          <H>New words</H>
          <WordTable words={lesson.words} caption={`New words in ${lesson.title}`} />
        </>
      )}

      {lesson.sentences.length > 0 && (
        <>
          <H>Examples</H>
          <ul className="space-y-3">
            {lesson.sentences.map((s, i) => (
              <li key={i} className="rounded-2xl bg-paper p-3">
                <BnText text={s} showEn />
              </li>
            ))}
          </ul>
        </>
      )}

      {lesson.playable && (
        <Link href={`/lesson/${lesson.id}`} className="btn btn-ghost mt-5 w-full">
          Practise this lesson
        </Link>
      )}
    </section>
  );
}
