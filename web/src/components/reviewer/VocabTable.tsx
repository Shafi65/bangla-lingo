import type { VocabItem } from "@/lib/types";
import type { KolkataMap, Target } from "@/lib/reviewer/targets";
import { BnLine, Tr } from "./bits";
import { ReviewControls } from "./ReviewControls";

const COLS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]";

/** The lesson's vocabulary, one reviewable row each. Rows are wrapped by the caller (active ring, ids). */
export function VocabTable({
  lessonId,
  vocab,
  kolkata,
  targets,
  wrap,
}: {
  lessonId: string;
  vocab: VocabItem[];
  kolkata: KolkataMap;
  targets: Map<string, Target>;
  wrap: (key: string, children: React.ReactNode) => React.ReactNode;
}) {
  return (
    <div role="table" aria-label="Vocabulary" className="overflow-hidden rounded-2xl border-2 border-line bg-surface">
      <div role="row" className={`hidden gap-3 border-b-2 border-line bg-sunk px-3 py-1.5 text-xs font-extrabold tracking-wide text-muted uppercase md:grid ${COLS}`}>
        <div role="columnheader">Bengali / transliteration</div>
        <div role="columnheader">English</div>
        <div role="columnheader">Notes</div>
        <div role="columnheader">Kolkata variant</div>
      </div>
      {vocab.map((v) => {
        const key = `vocab:${v.id}`;
        const t = targets.get(key)!;
        const k = kolkata[v.id];
        return wrap(
          key,
          <div role="row" className="border-b border-line px-3 py-2 last:border-b-0">
            <div className={`grid gap-x-3 gap-y-1 ${COLS}`}>
              <div role="cell">
                <BnLine bn={v.bn} tr={v.tr} />
              </div>
              <div role="cell" className="font-semibold [overflow-wrap:anywhere]">
                <span className="mr-1 text-xs font-extrabold text-muted uppercase md:hidden">English </span>
                {v.en}
              </div>
              <div role="cell" className={`text-sm text-ink/85 [overflow-wrap:anywhere] ${v.notes ? "" : "hidden md:block"}`}>
                {v.notes ? (
                  <>
                    <span className="mr-1 text-xs font-extrabold text-muted uppercase md:hidden">Notes </span>
                    {v.notes}
                  </>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </div>
              <div role="cell" className={k?.bn || k?.tr ? "" : "hidden md:block"}>
                {k?.bn || k?.tr ? (
                  <div>
                    <span className="text-xs font-extrabold text-muted uppercase md:hidden">Kolkata variant</span>
                    {k.bn && (
                      <div lang="bn" className="text-lg font-bold [overflow-wrap:anywhere]">
                        {k.bn}
                      </div>
                    )}
                    {k.tr && <Tr>{k.tr}</Tr>}
                  </div>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </div>
            </div>
            <div className="mt-1.5">
              <ReviewControls lessonId={lessonId} target={t} compact />
            </div>
          </div>,
        );
      })}
    </div>
  );
}
