import type { KinData } from "./types";

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isText = (x: unknown) => isObj(x) && isStr(x.bn) && typeof x.tr === "string" && typeof x.en === "string";

/**
 * Shape check for content/family/kin.json, enough for the page to render safely. The full rules live in
 * content/scripts/validate-family.mjs (npm run validate:family).
 */
export function isKinData(x: unknown): x is KinData {
  if (!isObj(x) || x.version !== 1 || !isStr(x.defaultVariety)) return false;
  const arrays = ["varieties", "pronouns", "kinds", "phrases", "groups", "relations"] as const;
  if (!arrays.every((k) => Array.isArray(x[k]) && (x[k] as unknown[]).length > 0)) return false;
  const vIds = (x.varieties as unknown[]).map((v) => (isObj(v) ? v.id : undefined));
  if (!vIds.includes(x.defaultVariety)) return false;
  if (!(x.pronouns as unknown[]).every((p) => isText(p) && isObj(p) && isStr(p.id))) return false;
  if (!(x.phrases as unknown[]).every((p) => isText(p) && isObj(p) && isStr(p.kind))) return false;
  if (!(x.groups as unknown[]).every((g) => isObj(g) && isStr(g.id) && Array.isArray(g.asks))) return false;
  return (x.relations as unknown[]).every(
    (r) =>
      isObj(r) &&
      isStr(r.id) &&
      isStr(r.group) &&
      isObj(r.pick) &&
      isObj(r.pronoun) &&
      Array.isArray(r.phrases) &&
      isObj(r.terms) &&
      vIds.every((v) => {
        const t = (r.terms as Record<string, unknown>)[v as string];
        return isObj(t) && isText(t.ref) && Array.isArray(t.addr) && t.addr.every(isText);
      }),
  );
}
