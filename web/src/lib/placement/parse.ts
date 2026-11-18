// Light structural guards for the placement JSON (the full checks live in
// content/scripts/validate-placement.mjs). Pure.
import { BANDS, SKILLS, type ItemBank, type PlacementConfig } from "./types";

const TYPES = new Set(["select_translation", "listen_select", "script_recognize", "listen_meaning", "fill_blank", "reading"]);

export function isItemBank(v: unknown): v is ItemBank {
  const b = v as ItemBank | null;
  return (
    !!b &&
    Array.isArray(b.items) &&
    b.items.length > 0 &&
    b.items.every(
      (i) =>
        typeof i?.id === "string" &&
        (BANDS as readonly string[]).includes(i.band) &&
        (SKILLS as readonly string[]).includes(i.skill) &&
        !!i.exercise &&
        TYPES.has(i.exercise.type) &&
        Array.isArray((i.exercise as { options?: unknown }).options) &&
        Number.isInteger((i.exercise as { answer?: unknown }).answer),
    )
  );
}

export function isPlacementConfig(v: unknown): v is PlacementConfig {
  const c = v as PlacementConfig | null;
  return (
    !!c &&
    Array.isArray(c.bands) &&
    !!c.skills &&
    !!c.stages?.routing?.slots &&
    Array.isArray(c.stages.blockSlots) &&
    !!c.stages.final &&
    !!c.earlyStop &&
    !!c.scoring &&
    !!c.routes &&
    Array.isArray(c.background?.questions)
  );
}
