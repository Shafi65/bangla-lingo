// Adaptive placement engine. Pure functions only (no React, no storage, no clock):
// the UI keeps a SessionState and feeds answers in; `placeLearner` turns the answers into a placement.
//
// Flow (cut scores live in content/placement/config.json):
//   [script check: 3 A0 items, only when the learner says they can't read the script yet]
//   routing  7 items, everyone          -> block A / B / C by routing score
//   block    9 items (3 L, 3 R, 3 G)     -> final band by routing + block total (out of 16)
//   final    9 items (3 L, 3 R, 3 G)
// Early stop: a very low routing score with no listening right ends the test; a perfect
// routing + block C ends it at the top. The background answers only decide whether the
// script check runs; they never change a score.
import {
  BANDS,
  GROUPS,
  SKILLS,
  type AnswerRecord,
  type Background,
  type BackgroundRule,
  type Band,
  type BlockId,
  type Group,
  type GroupResult,
  type ItemBank,
  type Placement,
  type PlacementConfig,
  type PlacementItem,
  type PlacementUnit,
  type SessionState,
  type Slot,
  type StageId,
} from "./types";

export const bandIndex = (b: Band | null | undefined): number => (b ? BANDS.indexOf(b) : -1);

/** Small seeded PRNG (mulberry32), so a session is reproducible from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when every question named in the rule has one of its listed answers. */
export function matchesRule(bg: Background, rule: BackgroundRule): boolean {
  const keys = Object.keys(rule);
  return keys.length > 0 && keys.every((k) => bg[k] !== undefined && rule[k].includes(bg[k] as string));
}

export const groupOf = (item: Pick<PlacementItem, "skill">, cfg: PlacementConfig): Group =>
  cfg.skills[item.skill];

/** The first stage for this learner: the script check if they can't read yet, else routing. */
export function firstStage(bg: Background, cfg: PlacementConfig): StageId {
  return matchesRule(bg, cfg.background.scriptCheckWhen) ? "script" : "routing";
}

/**
 * Pick one unused item per slot. Prefers the exact band and skill, then any skill of the group at
 * that band, then the nearest band (lower first). Returns the ids and how many slots borrowed.
 */
export function pickItems(
  bank: ItemBank,
  cfg: PlacementConfig,
  slots: readonly Slot[],
  defaultBand: Band,
  used: ReadonlySet<string>,
  rand: () => number,
): { ids: string[]; fallbacks: number } {
  const taken = new Set(used);
  const ids: string[] = [];
  let fallbacks = 0;
  for (const slot of slots) {
    const band = slot.band ?? defaultBand;
    const free = bank.items.filter((i) => !taken.has(i.id) && groupOf(i, cfg) === slot.group);
    const tiers: PlacementItem[][] = [
      free.filter((i) => i.band === band && (!slot.skill || i.skill === slot.skill)),
      free.filter((i) => i.band === band),
    ];
    const bi = bandIndex(band);
    const others = [...BANDS]
      .filter((b) => b !== band)
      .sort((x, y) => Math.abs(bandIndex(x) - bi) - Math.abs(bandIndex(y) - bi) || bandIndex(x) - bandIndex(y));
    for (const b of others) tiers.push(free.filter((i) => i.band === b));
    const tier = tiers.findIndex((t) => t.length > 0);
    if (tier < 0) continue; // bank exhausted for this group: the stage is simply shorter
    if (tier >= 2) fallbacks++;
    const pool = tiers[tier];
    const pick = pool[Math.floor(rand() * pool.length)];
    taken.add(pick.id);
    ids.push(pick.id);
  }
  return { ids, fallbacks };
}

function stageSlots(stage: StageId, cfg: PlacementConfig): Slot[] {
  if (stage === "script") return cfg.stages.scriptCheck.slots;
  if (stage === "routing") return cfg.stages.routing.slots;
  return cfg.stages.blockSlots;
}

function enterStage(
  s: SessionState,
  stage: StageId,
  band: Band,
  bank: ItemBank,
  cfg: PlacementConfig,
): SessionState {
  // Re-derive the generator from seed + stage so a stage's picks don't depend on answer timing.
  const rand = rng(s.seed + 7919 * (["script", "routing", "block", "final"].indexOf(stage) + 1));
  const { ids, fallbacks } = pickItems(bank, cfg, stageSlots(stage, cfg), band, new Set(s.used), rand);
  const next: SessionState = {
    ...s,
    stage,
    queue: ids,
    index: 0,
    used: [...s.used, ...ids],
    fallbacks: s.fallbacks + fallbacks,
  };
  return ids.length ? next : advance(next, bank, cfg);
}

export function createSession(bank: ItemBank, cfg: PlacementConfig, bg: Background, seed: number): SessionState {
  const empty: SessionState = { seed, stage: "routing", queue: [], index: 0, answers: [], used: [], fallbacks: 0 };
  return enterStage(empty, firstStage(bg, cfg), "A0", bank, cfg);
}

export function currentItem(s: SessionState, bank: ItemBank): PlacementItem | undefined {
  if (s.stage === "done") return undefined;
  const id = s.queue[s.index];
  return bank.items.find((i) => i.id === id);
}

const correctIn = (answers: readonly AnswerRecord[], stage: StageId, group?: Group) =>
  answers.filter((a) => a.stage === stage && a.correct && (!group || a.group === group)).length;

/** Block for a routing score. */
export function blockFor(routingCorrect: number, cfg: PlacementConfig): BlockId {
  const cut = cfg.stages.routing.cuts.find((c) => routingCorrect <= c.maxCorrect);
  return (cut ?? cfg.stages.routing.cuts[cfg.stages.routing.cuts.length - 1]).block;
}

/** Final-stage band for a block and the routing + block total. */
export function finalBandFor(block: BlockId, total: number, cfg: PlacementConfig): Band {
  const cuts = cfg.stages.final[block];
  return (cuts.find((c) => total <= c.maxTotal) ?? cuts[cuts.length - 1]).band;
}

/** Move past the end of the current stage. */
function advance(s: SessionState, bank: ItemBank, cfg: PlacementConfig): SessionState {
  switch (s.stage) {
    case "script":
      return enterStage(s, "routing", "A1", bank, cfg);
    case "routing": {
      const r = correctIn(s.answers, "routing");
      const bottom = cfg.earlyStop.bottom;
      if (r <= bottom.maxRoutingCorrect && correctIn(s.answers, "routing", "listening") <= bottom.maxRoutingListeningCorrect) {
        return { ...s, stage: "done", queue: [], index: 0, stopReason: "early-bottom" };
      }
      const block = blockFor(r, cfg);
      return enterStage({ ...s, block }, "block", cfg.stages.blocks[block].band, bank, cfg);
    }
    case "block": {
      const total = correctIn(s.answers, "routing") + correctIn(s.answers, "block");
      const block = s.block ?? "A";
      const top = cfg.earlyStop.top;
      if (block === top.block && total >= top.minTotal) {
        return { ...s, stage: "done", queue: [], index: 0, stopReason: "early-top" };
      }
      const finalBand = finalBandFor(block, total, cfg);
      return enterStage({ ...s, finalBand }, "final", finalBand, bank, cfg);
    }
    case "final":
      return { ...s, stage: "done", queue: [], index: 0, stopReason: "complete" };
    default:
      return s;
  }
}

/** Record the answer to the current item and move on (possibly to the next stage, or done). */
export function answerCurrent(
  s: SessionState,
  bank: ItemBank,
  cfg: PlacementConfig,
  correct: boolean,
  skipped = false,
): SessionState {
  const item = currentItem(s, bank);
  if (!item || s.stage === "done") return s;
  const rec: AnswerRecord = {
    itemId: item.id,
    band: item.band,
    skill: item.skill,
    group: groupOf(item, cfg),
    stage: s.stage,
    correct: correct && !skipped,
    ...(skipped ? { skipped: true } : {}),
  };
  const next: SessionState = { ...s, answers: [...s.answers, rec], index: s.index + 1 };
  return next.index < next.queue.length ? next : advance(next, bank, cfg);
}

/** The learner chose to stop: keep what they answered. */
export function stopSession(s: SessionState): SessionState {
  return s.stage === "done" ? s : { ...s, stage: "done", queue: [], index: 0, stopReason: "user" };
}

/** Rough progress for the UI: answered and expected total (shrinks or ends with early stops). */
export function progressOf(s: SessionState, cfg: PlacementConfig): { answered: number; expected: number } {
  const answered = s.answers.length;
  if (s.stage === "done") return { answered, expected: answered };
  const later: Record<StageId, number> = {
    script: cfg.stages.routing.slots.length + 2 * cfg.stages.blockSlots.length,
    routing: 2 * cfg.stages.blockSlots.length,
    block: cfg.stages.blockSlots.length,
    final: 0,
  };
  return { answered, expected: answered + (s.queue.length - s.index) + later[s.stage] };
}

// ---------------------------------------------------------------------------
// Scoring

/** Highest band (above A0) passed by these counts: at least minItems items and ≥ passRatio right. */
export function levelFromBands(byBand: GroupResult["byBand"], cfg: PlacementConfig): Band | null {
  let level: Band | null = null;
  for (const b of BANDS) {
    if (b === "A0") continue;
    const c = byBand[b];
    if (c && c.total >= cfg.scoring.minItems && c.correct / c.total >= cfg.scoring.passRatio) level = b;
  }
  return level;
}

export function scoreAnswers(answers: readonly AnswerRecord[], cfg: PlacementConfig): GroupResult[] {
  return GROUPS.map((group) => {
    const mine = answers.filter((a) => a.group === group);
    const byBand: GroupResult["byBand"] = {};
    for (const a of mine) {
      const c = (byBand[a.band] ??= { correct: 0, total: 0 });
      c.total++;
      if (a.correct) c.correct++;
    }
    return {
      group,
      correct: mine.filter((a) => a.correct).length,
      total: mine.length,
      level: levelFromBands(byBand, cfg),
      byBand,
    };
  });
}

export function skillCounts(answers: readonly AnswerRecord[]): Placement["bySkill"] {
  const out = Object.fromEntries(SKILLS.map((k) => [k, { correct: 0, total: 0 }])) as Placement["bySkill"];
  for (const a of answers) {
    out[a.skill].total++;
    if (a.correct) out[a.skill].correct++;
  }
  return out;
}

/** Reads the script: passed reading at A1 or above, or got ≥ passRatio of the script check. */
export function readsScript(groups: GroupResult[], cfg: PlacementConfig): boolean {
  const r = groups.find((g) => g.group === "reading");
  if (!r) return false;
  if (bandIndex(r.level) >= bandIndex("A1")) return true;
  const a0 = r.byBand.A0;
  return !!a0 && a0.total >= cfg.scoring.minItems && a0.correct / a0.total >= cfg.scoring.passRatio;
}

// ---------------------------------------------------------------------------
// Course mapping

/** Band of each unit: script units are A0, intermediate units B1, main units by the band start they follow. */
export function unitBands(units: readonly PlacementUnit[], cfg: PlacementConfig): Map<string, Band> {
  const starts = new Map(cfg.bands.filter((b) => b.startUnit).map((b) => [b.startUnit as string, b.id]));
  const out = new Map<string, Band>();
  let current: Band = "A1";
  for (const u of units) {
    if (u.track === "script") out.set(u.id, "A0");
    else if (u.level === "intermediate") out.set(u.id, "B1");
    else {
      const s = starts.get(u.id);
      if (s && s !== "B1") current = s;
      out.set(u.id, current);
    }
  }
  return out;
}

/** "Unit 6: At the bazaar" (main units numbered per level, as on the course map). */
export function unitLabel(units: readonly PlacementUnit[], id: string): string {
  const u = units.find((x) => x.id === id);
  if (!u) return id;
  if (u.track === "script") return u.title;
  if (u.level === "intermediate") {
    const m = /^i(\d+)-/.exec(u.id);
    if (m && Number(m[1]) === 0) return `Intermediate: ${u.title}`;
    if (m) return `Intermediate Unit ${Number(m[1])}: ${u.title}`;
  }
  const n = units.filter((x) => x.track === "main" && x.level === u.level).findIndex((x) => x.id === id) + 1;
  return `${u.level === "intermediate" ? "Intermediate Unit" : "Unit"} ${n}: ${u.title}`;
}

const bandLabel = (cfg: PlacementConfig, b: Band) => cfg.bands.find((x) => x.id === b)?.label ?? b;

/** First main unit of a band in course order (falls back to the nearest band that has one). */
function firstUnitOfBand(units: readonly PlacementUnit[], bands: Map<string, Band>, band: Band): PlacementUnit | undefined {
  const main = units.filter((u) => u.track === "main" && u.lessons.length > 0);
  const want = bandIndex(band);
  for (let d = 0; d < BANDS.length; d++) {
    for (const b of [want - d, want + d]) {
      if (b < 1 || b >= BANDS.length) continue;
      const hit = main.find((u) => bands.get(u.id) === BANDS[b]);
      if (hit) return hit;
    }
  }
  return main[0];
}

function lessonsBefore(
  units: readonly PlacementUnit[],
  startId: string,
  include: (u: PlacementUnit) => boolean,
): string[] {
  const out: string[] = [];
  for (const u of units) {
    if (u.id === startId) break;
    if (include(u)) out.push(...u.lessons);
  }
  return out;
}

/**
 * Turn answers into a placement. Routes (from the blueprint):
 *  - grammar ≥ A2b and reading ≥ A2a                  -> intermediate track
 *  - listening ≥ A2a but reading below A1             -> fast lane: alphabet first, easier main units marked done
 *  - otherwise the band after min(reading, grammar)   -> that band's first unit
 *  - nothing passed: Unit 1, or the alphabet if they said they can't read yet and the script check didn't show otherwise
 */
export function placeLearner(
  s: Pick<SessionState, "answers" | "stopReason">,
  bg: Background,
  units: readonly PlacementUnit[],
  cfg: PlacementConfig,
): Placement {
  const groups = scoreAnswers(s.answers, cfg);
  const lvl = (g: Group) => groups.find((x) => x.group === g)?.level ?? null;
  const L = bandIndex(lvl("listening"));
  const R = bandIndex(lvl("reading"));
  const G = bandIndex(lvl("grammar"));
  const script = readsScript(groups, cfg);
  const bands = unitBands(units, cfg);
  const heritage = matchesRule(bg, cfg.background.heritageWhen);
  const partial = s.stopReason === "user";
  const notes: string[] = [];
  if (matchesRule(bg, cfg.background.varietyNoteWhen)) {
    notes.push(
      "The listening clips use standard Bangladeshi Bengali, which can sound quite different from a regional variety such as Sylheti or Chittagonian. Missing some of them is expected.",
    );
  }
  if (partial) notes.push(`You stopped early, so this is based on ${s.answers.length} answer${s.answers.length === 1 ? "" : "s"}. You can take the test again any time.`);

  const firstScript = units.find((u) => u.track === "script" && u.lessons.length > 0);
  const base = { groups, bySkill: skillCounts(s.answers), heritage, partial, answered: s.answers.length, notes };

  const atStart = (alphabet: boolean, explanation: string): Placement => {
    const unit = alphabet && firstScript ? firstScript : firstUnitOfBand(units, bands, "A1");
    return {
      ...base,
      route: alphabet && firstScript ? "alphabet" : "start",
      kind: alphabet && firstScript ? "alphabet" : "beginner",
      startUnitId: unit?.id ?? "",
      startLessonId: unit?.lessons[0] ?? "",
      startLabel: alphabet && firstScript ? "The alphabet" : unit ? unitLabel(units, unit.id) : "",
      completeLessonIds: [],
      explanation,
    };
  };

  const inter = cfg.routes.intermediate;
  if (G >= bandIndex(inter.grammarAtLeast) && R >= bandIndex(inter.readingAtLeast)) {
    const unit = firstUnitOfBand(units, bands, "B1");
    if (unit) {
      const done = lessonsBefore(units, unit.id, () => true);
      return {
        ...base,
        route: "intermediate",
        kind: bands.get(unit.id) === "B1" ? "intermediate" : "beginner",
        startUnitId: unit.id,
        startLessonId: unit.lessons[0],
        startLabel: unitLabel(units, unit.id),
        completeLessonIds: done,
        explanation:
          "You read Bengali script and handled the past, the future and everyday grammar, so you can go straight to the intermediate track. The beginner units are marked done and stay open if you want to review.",
      };
    }
  }

  const fast = cfg.routes.fastLane;
  if (L >= bandIndex(fast.listeningAtLeast) && R < bandIndex(fast.readingBelow) && firstScript) {
    // Mark the main units of bands below the listening level as done; leave the script track open.
    const done = units
      .filter((u) => u.track === "main" && bandIndex(bands.get(u.id)) < L)
      .flatMap((u) => u.lessons);
    const upTo = BANDS[L - 1];
    return {
      ...base,
      route: "fast-lane",
      kind: "alphabet",
      startUnitId: firstScript.id,
      startLessonId: firstScript.lessons[0],
      startLabel: "The alphabet",
      completeLessonIds: done,
      explanation:
        `You understand spoken Bengali much better than you read it. Start with the alphabet; ` +
        (done.length ? `${bandLabel(cfg, upTo)} are marked done, so after the script you can move on quickly.` : "the units after it will go quickly."),
    };
  }

  const course = Math.min(R, G);
  if (course < bandIndex("A1")) {
    const alphabet = matchesRule(bg, cfg.background.scriptCheckWhen) && !script;
    return atStart(
      alphabet,
      alphabet
        ? "Learning to read the script first will make every unit easier. Start with the alphabet, then Unit 1."
        : "Starting from the beginning is the best fit. The first units go quickly when some of it is familiar.",
    );
  }
  const startBand = BANDS[Math.min(course + 1, BANDS.length - 1)];
  const unit = firstUnitOfBand(units, bands, startBand);
  if (!unit) return atStart(false, "Starting from the beginning is the best fit.");
  const done = lessonsBefore(units, unit.id, (u) => u.track === "main" || script);
  const strong = BANDS[course];
  return {
    ...base,
    route: "standard",
    kind: bands.get(unit.id) === "B1" ? "intermediate" : "beginner",
    startUnitId: unit.id,
    startLessonId: unit.lessons[0],
    startLabel: unitLabel(units, unit.id),
    completeLessonIds: done,
    explanation:
      `Your reading and grammar are solid up to ${bandLabel(cfg, strong)}, so you start at ${unitLabel(units, unit.id)}. ` +
      "The earlier lessons are marked done and stay open for review.",
  };
}
