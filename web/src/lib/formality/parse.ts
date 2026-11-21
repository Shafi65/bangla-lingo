import type { FormalityBank, FormalityIntro, FormalityScenario, FormalityText, FormalityTier } from "./types";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

export function isFormalityText(x: unknown): x is FormalityText {
  return isObj(x) && isStr(x.bn) && typeof x.tr === "string" && typeof x.en === "string";
}

function isTier(x: unknown): x is FormalityTier {
  return isObj(x) && Number.isInteger(x.id) && isStr(x.title) && typeof x.description === "string";
}

function isIntro(x: unknown): x is FormalityIntro {
  return (
    isObj(x) && isStr(x.label) && typeof x.use === "string" && isFormalityText(x.pronoun) &&
    Array.isArray(x.forms) && x.forms.every(isFormalityText)
  );
}

export function isScenario(x: unknown): x is FormalityScenario {
  if (!isObj(x) || !isStr(x.id) || !Number.isInteger(x.tier) || !isStr(x.situation) || !isStr(x.why)) return false;
  if (x.prompt !== undefined && !isFormalityText(x.prompt)) return false;
  if (!Array.isArray(x.options) || x.options.length < 2 || !x.options.every(isFormalityText)) return false;
  const n = x.options.length;
  if (!Array.isArray(x.answer) || x.answer.length === 0) return false;
  if (!x.answer.every((a) => Number.isInteger(a) && a >= 0 && a < n)) return false;
  if (x.varies !== undefined && typeof x.varies !== "string") return false;
  if (x.notes !== undefined && typeof x.notes !== "string") return false;
  return true;
}

/** Structural check of the bank (the content validator does the full check at build time). */
export function isFormalityBank(x: unknown): x is FormalityBank {
  if (!isObj(x) || x.version !== 1) return false;
  if (!Number.isInteger(x.roundSize) || (x.roundSize as number) < 1) return false;
  if (!Number.isInteger(x.unlockScore) || (x.unlockScore as number) < 1) return false;
  if (!Array.isArray(x.intro) || !x.intro.every(isIntro)) return false;
  if (!Array.isArray(x.tiers) || x.tiers.length === 0 || !x.tiers.every(isTier)) return false;
  if (!Array.isArray(x.scenarios) || x.scenarios.length === 0 || !x.scenarios.every(isScenario)) return false;
  const tierIds = new Set((x.tiers as FormalityTier[]).map((t) => t.id));
  return (x.scenarios as FormalityScenario[]).every((s) => tierIds.has(s.tier));
}
