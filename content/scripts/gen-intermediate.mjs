// Intermediate lesson recipe for gen-lesson.mjs (chosen automatically for units with "level": "intermediate").
//
//   warm-up recall (3, en->bn select, review words)
//   reading             one per dialogue question (max 2), built from the plan's `dialogue`
//   listen_meaning      3, on plan sentences (those carrying the most new words first)
//   recognition         bn->en select (+ listen_select) for any new word not yet seen in the reading / listening
//   fill_blank          up to 4 on new words inside plan sentences: choose first, typed last
//   word_bank en->bn    2
//   type_translation    en->bn, 2
//
// A new word's first exercise is always recognition (reading, listen_meaning or a bn->en select); warm-up
// exercises only use review/known words, never this lesson's new words (not even as distractors).
import { blankOccurrences, enKey, exerciseText, hasForm, shuffle, tokenize } from "./lib.mjs";

const TARGET_TOTAL = 16; // hand-written exercises aimed at (the validator accepts 12-18)

export function buildIntermediate({ ctx, lessonId, P, newE, reviewE, known, rand }) {
  const info = ctx.lessonInfo.get(lessonId);
  const pick = (arr, n) => shuffle(arr, rand).slice(0, n);
  const bt = (e) => ({ bn: e.bn, tr: e.tr, en: e.en });
  const glosses = (e) => new Set([e.en, ...(e.alt ?? [])].map((s) => s.toLowerCase()));
  const sentences = (P.sentences ?? []).filter((s) => s?.bn && s?.tr && s?.en);
  const newIds = new Set(newE.map((e) => e.id));
  const letters = (e) => e.pos === "letter";

  const knownWords = known.filter((e) => !letters(e) && e.pos !== "phrase" && !e.bn.includes(" "));
  const oldWords = knownWords.filter((e) => !newIds.has(e.id)); // warm-up distractors: nothing from this lesson
  const wordPool = [...knownWords, ...known.filter((e) => e.pos === "phrase")];

  const place = (correct, wrong) => {
    const opts = wrong.slice();
    const answer = Math.floor(rand() * (opts.length + 1));
    opts.splice(answer, 0, correct);
    return { options: opts, answer };
  };
  const distractors = (e, pool, extraOk = () => true, n = 3) => {
    const ok = pool.filter((d) => d.id !== e.id && d.bn !== e.bn && !glosses(e).has(d.en.toLowerCase()) && d.tr !== e.tr && extraOk(d));
    const same = ok.filter((d) => d.pos === e.pos);
    const src = same.length >= n ? same : ok;
    const seen = new Set(), out = [];
    for (const d of shuffle(src, rand)) {
      if (seen.has(d.bn)) continue;
      seen.add(d.bn); out.push(d);
      if (out.length === n) break;
    }
    return out;
  };

  const ex = []; // { rank, ...exercise } until ids are assigned
  const add = (rank, o) => ex.push({ rank, ...o });
  const text = () => ex.map(exerciseText).join("|");

  // ---- 1) warm-up recall: review words, topped up from other known words
  const review = reviewE.filter((e) => !letters(e) && e.pos !== "name" && !newIds.has(e.id));
  const warm = [...pick(review, 3)];
  for (const e of pick(oldWords.filter((w) => w.pos !== "name" && !warm.includes(w)), 3 - warm.length)) warm.push(e);
  for (const e of warm) {
    const d = distractors(e, oldWords);
    if (d.length >= 2) add(0, { type: "select_translation", prompt: bt(e), direction: "en_to_bn", ...place(e.bn, d.map((x) => x.bn)) });
  }

  // ---- 2) reading from the plan's dialogue (one per question, at most 2)
  const D = P.dialogue;
  if (D?.lines?.length) {
    for (const q of (D.questions ?? []).slice(0, 2)) {
      add(1, {
        type: "reading",
        ...(D.title ? { title: D.title } : {}),
        lines: D.lines.map((l) => ({ ...(l.speaker ? { speaker: l.speaker } : {}), bn: l.bn, tr: l.tr, en: l.en })),
        question: q.question,
        ...(q.questionBn ? { questionBn: q.questionBn } : {}),
        options: q.options,
        answer: q.answer,
      });
    }
  }

  // ---- 3) listen_meaning on plan sentences: sentences carrying new words the reading does not cover come first
  const used = new Map(); // sentence index -> times used
  const bump = (i) => used.set(i, (used.get(i) ?? 0) + 1);
  const hasWord = (s, e) => blankOccurrences(s.bn, e.bn).length >= 1;
  const earlierSentences = [...ctx.plans.values()].flatMap((p) => p.lessons ?? [])
    .filter((l) => (ctx.lessonInfo.get(l.id)?.index ?? 1e9) < (info?.index ?? 0))
    .flatMap((l) => l.sentences ?? []);
  const listenCount = Math.min(3, sentences.length);
  const chosenListen = [];
  while (chosenListen.length < listenCount) {
    const covered = text() + " " + chosenListen.map((i) => ` ${tokenize(sentences[i].bn).join(" ")} `).join("|");
    const need = newE.filter((e) => !letters(e) && !hasForm(covered, e.bn));
    const scored = sentences.map((s, i) => ({ i, score: need.filter((e) => hasWord(s, e)).length + rand() * 0.5 }))
      .filter((x) => !chosenListen.includes(x.i)).sort((a, b) => b.score - a.score);
    chosenListen.push(scored[0].i);
  }
  for (const i of chosenListen) {
    const s = sentences[i];
    const mine = new Set([s.en, ...(s.alt ?? [])].map(enKey));
    const wrong = [], seen = new Set(mine);
    for (const o of shuffle([...sentences, ...earlierSentences], rand)) {
      const k = enKey(o.en ?? "");
      if (!k || o.bn === s.bn || seen.has(k) || (o.alt ?? []).some((a) => mine.has(enKey(a)))) continue;
      seen.add(k); wrong.push(o.en);
      if (wrong.length === 3) break;
    }
    if (wrong.length >= 1) { add(2, { type: "listen_meaning", audio: { bn: s.bn, tr: s.tr, en: s.en }, ...place(s.en, wrong) }); bump(i); }
  }

  // ---- 4) recognition for any new word (or, in a review lesson, review word) the above did not show
  const focus = newE.length ? newE.filter((e) => !letters(e)) : pick(review, 8);
  for (const e of focus) {
    if (hasForm(text(), e.bn)) continue;
    add(3, { type: "select_translation", prompt: bt(e), direction: "bn_to_en", ...place(e.en, distractors(e, wordPool).map((d) => d.en)) });
  }
  if (ex.length <= 13) for (const e of focus) {
    if (e.pos === "name" || ex.length > 14) continue;
    const onlyOnce = ex.filter((x) => x.rank === 3 && x.prompt?.bn === e.bn).length === 1 && !sentences.some((s) => hasWord(s, e));
    if (onlyOnce) add(3, { type: "listen_select", audio: bt(e), ...place(e.bn, distractors(e, oldWords).map((d) => d.bn)) });
  }

  // ---- 5-7) production: fill_blank, word bank en->bn, type en->bn. Trim to the budget, recognition is never cut.
  const remaining = Math.max(3, TARGET_TOTAL - ex.length);
  const want = { fill: 4, wb: 2, type: 2 };
  for (const k of ["type", "wb", "fill"]) while (want.fill + want.wb + want.type > remaining && want[k] > 1) want[k]--;
  if (!sentences.length) want.fill = want.wb = want.type = 0;

  /** A plan sentence passing `must` (if any pass), the least used so far, preferring `pref`. */
  const take = (pref = () => true, must = () => true) => {
    const all = sentences.map((s, i) => ({ s, i }));
    const ok = all.filter((x) => must(x.s));
    const from = ok.length ? ok : all;
    const minUse = Math.min(...from.map((x) => used.get(x.i) ?? 0));
    const least = from.filter((x) => (used.get(x.i) ?? 0) === minUse);
    const prefd = least.filter((x) => pref(x.s));
    const c = pick(prefd.length ? prefd : least, 1)[0];
    bump(c.i);
    return c.s;
  };

  // fill_blank targets: new words first (least practised so far), then review words, only where a sentence has them once
  const cands = [...focus.filter((e) => !letters(e) && e.pos !== "name"), ...pick(review, 8)]
    .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
    .filter((e) => sentences.some((s) => blankOccurrences(s.bn, e.bn).length === 1));
  const practiced = (e) => ex.filter((x) => hasForm(exerciseText(x), e.bn)).length;
  const fillTargets = cands.map((e, i) => ({ e, i })).sort((a, b) => practiced(a.e) - practiced(b.e) || a.i - b.i).slice(0, want.fill).map((x) => x.e);
  const typedFill = Math.floor(fillTargets.length / 3);
  fillTargets.forEach((e, k) => {
    const s = take(() => true, (x) => blankOccurrences(x.bn, e.bn).length === 1);
    if (blankOccurrences(s.bn, e.bn).length !== 1) return;
    const base = { type: "fill_blank", sentence: { bn: s.bn, tr: s.tr, en: s.en }, blank: e.bn };
    if (k >= fillTargets.length - typedFill) {
      add(5, { ...base, accepted: [...new Set([e.bn, e.tr])] });
    } else {
      const inSentence = new Set(tokenize(s.bn));
      const d = distractors(e, knownWords, (x) => !tokenize(x.bn).some((t) => inSentence.has(t)));
      if (d.length >= 2) add(4, { ...base, ...place(e.bn, d.map((x) => x.bn)) });
    }
  });

  const bnPool = [...new Set(knownWords.map((e) => e.bn))];
  for (let k = 0; k < want.wb; k++) {
    const s = take((x) => newE.some((e) => hasWord(x, e)));
    const answer = tokenize(s.bn);
    const tiles = shuffle([...answer, ...pick(bnPool.filter((w) => !answer.includes(w)), 3)], rand);
    add(6, { type: "word_bank", prompt: { bn: s.bn, tr: s.tr, en: s.en }, direction: "en_to_bn", tiles, answer });
  }
  for (let k = 0; k < want.type; k++) {
    const s = take((x) => newE.some((e) => hasWord(x, e)));
    add(7, { type: "type_translation", prompt: { bn: s.bn, tr: s.tr, en: s.en }, direction: "en_to_bn", accepted: [...new Set([s.bn, s.tr])] });
  }

  // stable sort by rank (generation order within a rank), then number
  return ex.map((e, i) => ({ e, i })).sort((a, b) => a.e.rank - b.e.rank || a.i - b.i)
    .map(({ e }, i) => { const { rank, ...rest } = e; void rank; return { id: `e${String(i + 1).padStart(2, "0")}`, ...rest }; });
}
