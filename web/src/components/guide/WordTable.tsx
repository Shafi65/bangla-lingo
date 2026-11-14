import { SpeakButton } from "../SpeakButton";
import { Translit } from "../Translit";
import type { GuideWord } from "@/lib/guide/data";

/** New vocabulary of a lesson: Bengali + speaker, transliteration, English. */
export function WordTable({ words, caption }: { words: GuideWord[]; caption: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-line bg-white">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-paper text-xs font-extrabold tracking-wide text-muted uppercase">
          <tr>
            <th scope="col" className="w-[44%] px-3 py-2">Bengali</th>
            <th scope="col" className="w-[24%] px-2 py-2">Say it</th>
            <th scope="col" className="px-2 py-2">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {words.map((w) => (
            <tr key={w.id} className="border-t border-line align-top">
              <td className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <SpeakButton bn={w.bn} size="sm" />
                  <span lang="bn" className="min-w-0 text-xl font-bold break-words text-ink">
                    {w.bn}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-sm font-semibold break-words">
                <Translit tr={w.tr} />
              </td>
              <td className="px-2 py-2 text-sm font-semibold break-words text-ink">
                {w.en}
                {w.notes && (
                  <span className="mt-0.5 block text-xs font-semibold text-muted">{w.notes}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
