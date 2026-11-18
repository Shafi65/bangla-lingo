import type { ReactNode } from "react";
import { SpeakButton } from "@/components/SpeakButton";

export const HAS_BN = /[ঀ-৿]/;

/** Transliteration: always shown to reviewers, whatever the learner settings say. */
export function Tr({ children }: { children: ReactNode }) {
  return <span className="text-sm text-muted italic [overflow-wrap:anywhere]">{children}</span>;
}

/** A Bengali line: speaker, script, transliteration and (optionally) English. */
export function BnLine({
  bn,
  tr,
  en,
  large = false,
  speaker = true,
}: {
  bn: string;
  tr?: string;
  en?: string;
  large?: boolean;
  speaker?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {speaker && (
        <span className="mt-0.5 shrink-0">
          <SpeakButton bn={bn} size="sm" />
        </span>
      )}
      <div className="min-w-0">
        <div lang="bn" className={`font-bold text-ink [overflow-wrap:anywhere] ${large ? "bn-display text-4xl" : "text-lg"}`}>
          {bn}
        </div>
        {tr && (
          <div>
            <Tr>{tr}</Tr>
          </div>
        )}
        {en && <div className="text-sm font-semibold text-ink/80 [overflow-wrap:anywhere]">{en}</div>}
      </div>
    </div>
  );
}

/** Any authored string: Bengali ones get a speaker and transliteration (from the map), others are plain text. */
export function Str({ s, translit }: { s: string; translit?: Record<string, string> }) {
  if (!HAS_BN.test(s)) return <span className="font-semibold [overflow-wrap:anywhere]">{s}</span>;
  return <BnLine bn={s} tr={translit?.[s.normalize("NFC")]} />;
}

/** A sequence of tiles shown as one phrase. */
export function Seq({ tokens, translit }: { tokens: string[]; translit?: Record<string, string> }) {
  const joined = tokens.join(" ");
  if (!HAS_BN.test(joined)) return <span className="font-semibold">{joined}</span>;
  const trs = tokens.map((t) => translit?.[t.normalize("NFC")]);
  return <BnLine bn={joined} tr={trs.every(Boolean) ? trs.join(" ") : undefined} />;
}

export function Chip({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "good" | "warn" | "bad" | "info";
}) {
  const cls = {
    plain: "border-line-strong bg-sunk text-muted",
    good: "border-brand/40 bg-brand-light text-brand-dark",
    warn: "border-sun-edge/50 bg-sun-light text-sun-dark",
    bad: "border-accent/40 bg-accent-light text-accent-dark",
    info: "border-line-strong bg-surface text-ink",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-xs font-extrabold tracking-wide text-muted uppercase">{children}</div>;
}
