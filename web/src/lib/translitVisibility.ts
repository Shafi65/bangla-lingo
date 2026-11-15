// How transliteration should appear right now. Pure; CourseContext's useTranslitVisibility feeds it.
import type { Settings } from "./progress";

export type TranslitVisibility = "show" | "faded" | "reveal";

/**
 * - "show": always visible
 * - "faded": visible but quieter (learner has started the script track)
 * - "reveal": hidden behind a tap (setting "hidden", every script lesson done, or a script-only lesson)
 *
 * Script-only (intermediate) lessons are "reveal" whatever always/fade says, unless the learner turned on
 * `alwaysRomanize`, which restores the normal rules there.
 */
export function resolveTranslitVisibility(
  settings: Pick<Settings, "translit" | "alwaysRomanize">,
  scriptIds: readonly string[],
  completed: Readonly<Record<string, unknown>>,
  scriptOnly: boolean,
): TranslitVisibility {
  if (scriptOnly && !settings.alwaysRomanize) return "reveal";
  if (settings.translit === "always") return "show";
  if (settings.translit === "hidden") return "reveal";
  if (scriptIds.length === 0) return "show";
  const done = scriptIds.filter((id) => completed[id]).length;
  if (done === 0) return "show";
  return done >= scriptIds.length ? "reveal" : "faded";
}
