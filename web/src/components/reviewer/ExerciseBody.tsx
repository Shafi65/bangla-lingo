import { SpeakButton } from "@/components/SpeakButton";
import { Inline } from "@/components/lesson/MiniMarkdown";
import { splitAtBlank } from "@/lib/fillBlank";
import type { BnText, Exercise } from "@/lib/types";
import { BnLine, Chip, Label, Seq, Str, Tr } from "./bits";

type TrMap = Record<string, string>;

export const TYPE_LABEL: Record<Exercise["type"], string> = {
  select_translation: "Select translation",
  word_bank: "Word bank",
  match_pairs: "Match pairs",
  listen_select: "Listen, select",
  type_translation: "Type translation",
  script_recognize: "Script recognise",
  fill_blank: "Fill the blank",
  listen_meaning: "Listen, meaning",
  reading: "Reading",
};

function Text({ t, large }: { t: BnText; large?: boolean }) {
  return <BnLine bn={t.bn} tr={t.tr} en={t.en} large={large} />;
}

function Direction({ d }: { d: "bn_to_en" | "en_to_bn" }) {
  return <Chip tone="info">{d === "bn_to_en" ? "Bengali to English" : "English to Bengali"}</Chip>;
}

/** All options of a choice exercise; the correct one is marked in words and colour. */
function Options({ options, answer, translit }: { options: string[]; answer: number; translit?: TrMap }) {
  return (
    <div>
      <Label>Options</Label>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o, i) => {
          const right = i === answer;
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-xl border-2 px-2.5 py-1.5 ${
                right ? "border-brand bg-brand-light" : "border-line bg-surface"
              }`}
            >
              <span className="mt-0.5 w-5 shrink-0 text-sm font-black text-muted">{String.fromCharCode(65 + i)}</span>
              <div className="min-w-0 flex-1">
                <Str s={o} translit={translit} />
              </div>
              {right && <Chip tone="good">Correct</Chip>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StringList({ label, items, translit }: { label: string; items: string[]; translit?: TrMap }) {
  return (
    <div>
      <Label>{label}</Label>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((a, i) => (
          <li key={i} className="rounded-xl border-2 border-line bg-surface px-2.5 py-1.5">
            <Str s={a} translit={translit} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Static, answer-revealed view of one exercise (not playable). */
export function ExerciseBody({ ex, translit }: { ex: Exercise; translit: TrMap }) {
  return (
    <div className="space-y-3">
      <Content ex={ex} translit={translit} />
      {ex.why && (
        <div className="rounded-xl bg-sunk px-3 py-2 text-sm font-semibold text-ink/90">
          <span className="font-extrabold text-muted">Why: </span>
          <Inline text={ex.why} />
        </div>
      )}
    </div>
  );
}

function Content({ ex, translit }: { ex: Exercise; translit: TrMap }) {
  switch (ex.type) {
    case "select_translation":
      return (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <Text t={ex.prompt} />
            <Direction d={ex.direction} />
          </div>
          <Options options={ex.options} answer={ex.answer} translit={translit} />
        </>
      );
    case "word_bank": {
      const used = new Set([ex.answer, ...(ex.alt ?? [])].flat());
      return (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <Text t={ex.prompt} />
            <Direction d={ex.direction} />
          </div>
          <div>
            <Label>Tiles</Label>
            <ul className="flex flex-wrap gap-1.5">
              {ex.tiles.map((t, i) => (
                <li
                  key={i}
                  className={`rounded-xl border-2 px-2.5 py-1 ${used.has(t) ? "border-line-strong bg-surface" : "border-dashed border-line-strong bg-sunk"}`}
                >
                  <span lang={/[ঀ-৿]/.test(t) ? "bn" : undefined} className="font-bold [overflow-wrap:anywhere]">
                    {t}
                  </span>
                  {translit[t.normalize("NFC")] && (
                    <div>
                      <Tr>{translit[t.normalize("NFC")]}</Tr>
                    </div>
                  )}
                  {!used.has(t) && <div className="text-xs font-extrabold text-muted">distractor</div>}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border-2 border-brand bg-brand-light px-2.5 py-1.5">
            <Label>Answer</Label>
            <Seq tokens={ex.answer} translit={translit} />
          </div>
          {ex.alt?.map((seq, i) => (
            <div key={i} className="rounded-xl border-2 border-line bg-surface px-2.5 py-1.5">
              <Label>Also accepted (alt {i + 1})</Label>
              <Seq tokens={seq} translit={translit} />
            </div>
          ))}
        </>
      );
    }
    case "match_pairs":
      return (
        <div>
          <Label>Pairs</Label>
          <ul className="grid gap-1.5">
            {ex.pairs.map((p, i) => (
              <li
                key={i}
                className="grid gap-x-3 gap-y-0.5 rounded-xl border-2 border-line bg-surface px-2.5 py-1.5 sm:grid-cols-[1.4fr_1fr]"
              >
                <BnLine bn={p.bn} tr={p.tr} />
                <span className="self-center font-semibold [overflow-wrap:anywhere]">{p.en}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "listen_select":
      return (
        <>
          <div>
            <Label>Audio (the learner hears this)</Label>
            <Text t={ex.audio} />
          </div>
          <Options options={ex.options} answer={ex.answer} translit={translit} />
        </>
      );
    case "type_translation":
      return (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <Text t={ex.prompt} />
            <Direction d={ex.direction} />
          </div>
          <StringList label={`Accepted answers (${ex.accepted.length})`} items={ex.accepted} translit={translit} />
        </>
      );
    case "script_recognize":
      return (
        <>
          <BnLine bn={ex.glyph} large />
          <Options options={ex.options} answer={ex.answer} />
        </>
      );
    case "fill_blank": {
      const split = splitAtBlank(ex.sentence.bn, ex.blank);
      return (
        <>
          <div>
            <Label>Sentence (blank highlighted)</Label>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                <SpeakButton bn={ex.sentence.bn} size="sm" />
              </span>
              <div className="min-w-0">
                {split ? (
                  <div lang="bn" className="text-lg font-bold [overflow-wrap:anywhere]">
                    {split.before}
                    <mark className="rounded-md bg-sun-light px-1 font-black text-sun-dark ring-2 ring-sun-edge/60">
                      {ex.blank}
                    </mark>
                    {split.after}
                  </div>
                ) : (
                  <div lang="bn" className="text-lg font-bold">
                    {ex.sentence.bn} <Chip tone="bad">blank not found once</Chip>
                  </div>
                )}
                <Tr>{ex.sentence.tr}</Tr>
                <div className="text-sm font-semibold text-ink/80">{ex.sentence.en}</div>
              </div>
            </div>
          </div>
          {ex.options ? (
            <Options options={ex.options} answer={ex.answer ?? -1} translit={translit} />
          ) : (
            <StringList label="Typed answer: accepted (the blank itself is always accepted)" items={[ex.blank, ...(ex.accepted ?? [])]} />
          )}
        </>
      );
    }
    case "listen_meaning":
      return (
        <>
          <div>
            <Label>Audio (text hidden from the learner until checked)</Label>
            <Text t={ex.audio} />
          </div>
          <Options options={ex.options} answer={ex.answer} />
        </>
      );
    case "reading":
      return (
        <>
          {ex.title && <div className="font-extrabold">{ex.title}</div>}
          <ul className="grid gap-1.5">
            {ex.lines.map((l, i) => (
              <li key={i} className="rounded-xl border-2 border-line bg-surface px-2.5 py-1.5">
                {l.speaker && <div className="text-xs font-extrabold text-muted uppercase">{l.speaker}</div>}
                <Text t={l} />
              </li>
            ))}
          </ul>
          <div>
            <Label>Question</Label>
            {ex.questionBn && <Text t={ex.questionBn} />}
            <div className="font-semibold">{ex.question}</div>
          </div>
          <Options options={ex.options} answer={ex.answer} translit={translit} />
        </>
      );
  }
}
