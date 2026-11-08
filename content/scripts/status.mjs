#!/usr/bin/env node
// Coverage dashboard: planned vs authored vs reviewed, per unit. Usage: npm run status [-- --md]
import fs from "node:fs";
import { lessonPath, loadAll, readJson } from "./lib.mjs";

const md = process.argv.includes("--md");
const ctx = loadAll();
const rows = [];
const tot = { planned: 0, draft: 0, reviewed: 0, lex: 0, sent: 0 };
for (const u of ctx.course.units) {
  const plan = ctx.plans.get(u.id);
  const planned = plan?.lessons.length ?? 0;
  let draft = 0, reviewed = 0;
  for (const lid of u.lessons) {
    const f = lessonPath(u, lid);
    if (!fs.existsSync(f)) continue;
    readJson(f).status === "reviewed" ? reviewed++ : draft++;
  }
  const lex = [...ctx.lexicon.values()].filter((e) => e._unit === u.id).length;
  const sent = plan?.lessons.reduce((n, l) => n + (l.sentences?.length ?? 0), 0) ?? 0;
  const authored = draft + reviewed;
  const bar = planned ? "█".repeat(authored) + "░".repeat(Math.max(0, planned - authored)) : "(no plan)";
  rows.push([u.id, u.track, planned, draft, reviewed, lex, sent, bar]);
  Object.assign(tot, { planned: tot.planned + planned, draft: tot.draft + draft, reviewed: tot.reviewed + reviewed, lex: tot.lex + lex, sent: tot.sent + sent });
}
const head = ["unit", "track", "planned", "draft", "reviewed", "lexicon", "sentences", "progress"];
rows.push(["TOTAL", "", tot.planned, tot.draft, tot.reviewed, tot.lex, tot.sent, `${Math.round(((tot.draft + tot.reviewed) / Math.max(1, tot.planned)) * 100)}% authored`]);
if (md) {
  console.log(`| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|`);
  for (const r of rows) console.log(`| ${r.join(" | ")} |`);
} else {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log(line(head)); console.log(w.map((n) => "-".repeat(n)).join("  "));
  rows.forEach((r) => console.log(line(r)));
}
// Next unauthored planned lessons, in course order
const next = ctx.order.filter((id) => {
  const i = ctx.lessonInfo.get(id);
  return i.planLesson && !i.unit.lessons.includes(id);
}).slice(0, 6);
console.log(`\nNext to author: ${next.join(", ") || "—"}`);
