"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CoinIcon, FlameIcon, FreezeIcon } from "@/components/icons";
import { celebrate } from "@/lib/celebrate";
import { boostActive, coinBalance, freezesHeld, marketDays, MAX_FREEZES, SHOP, type ShopItem } from "@/lib/game/engine";
import { lightLamp, purchase, useGame } from "@/lib/game/storage";
import { useNow } from "@/lib/review";
import { playSfx } from "@/lib/sfx";

const WHY: Record<string, string> = {
  full: `You already hold ${MAX_FREEZES} freezes.`,
  coins: "Not enough coins yet: finish lessons, quests and bazaar visits to earn more.",
  owned: "You already have this one.",
  unknown: "That item isn't sold any more.",
};

/** The coin shop: freezes, a review boost, a market day and streak-lamp colours. */
export function Shop() {
  const g = useGame();
  const now = useNow();
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const balance = coinBalance(g);

  const buy = (item: ShopItem) => {
    const r = purchase(item.id);
    if (!r.ok) {
      setMsg({ id: item.id, text: WHY[r.reason], ok: false });
      return;
    }
    playSfx(item.kind === "freeze" ? "freeze" : "coin");
    if (item.kind === "lamp") celebrate("small");
    setMsg({ id: item.id, text: item.kind === "lamp" ? "Lit. Your streak flame has a new colour." : "Bought.", ok: true });
  };

  /** What the learner already has of an item, shown on its card. */
  const status = (item: ShopItem): string | null => {
    switch (item.kind) {
      case "freeze":
        return `${freezesHeld(g)} of ${MAX_FREEZES} held`;
      case "boost":
        return now && boostActive(g, now) ? `Running: ${Math.ceil((g.boostUntil - now) / 60_000)} min left` : null;
      case "market":
        return marketDays(g) ? `${marketDays(g)} ready` : null;
      case "lamp":
        return g.lamp === item.id ? "Lit" : g.owned.includes(item.id) ? "Owned" : null;
    }
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">The shop</h1>
          <p className="mt-1 font-semibold text-muted">Spend the taka coins you earn by playing. Lessons are never for sale.</p>
        </div>
        <p className="flex items-center gap-1.5 text-2xl font-black text-sun-dark" aria-label={`${balance} taka coins`}>
          <CoinIcon size={28} />
          <motion.span key={balance} initial={{ scale: 1.3 }} animate={{ scale: 1 }} aria-hidden className="tabular-nums">
            {balance}
          </motion.span>
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {SHOP.map((item, i) => {
          const owned = item.kind === "lamp" && g.owned.includes(item.id);
          const lit = owned && g.lamp === item.id;
          const st = status(item);
          return (
            <motion.li
              key={item.id}
              className="card flex flex-col gap-3 p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunk"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.kind === "freeze" ? (
                    <span className="text-brand">
                      <FreezeIcon size={30} />
                    </span>
                  ) : item.kind === "lamp" ? (
                    <FlameIcon size={30} />
                  ) : item.kind === "boost" ? (
                    <span className="text-lg font-black text-sun-dark">2×</span>
                  ) : (
                    <CoinIcon size={30} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-black text-ink">{item.title}</h2>
                  <p className="text-sm font-semibold text-muted">{item.body}</p>
                  {st && <p className="mt-1 text-xs font-extrabold text-brand-dark">{st}</p>}
                </div>
              </div>
              {owned ? (
                <button type="button" className="btn btn-ghost w-full" onClick={() => lightLamp(lit ? null : item.id)}>
                  {lit ? "Back to marigold" : "Light this lamp"}
                </button>
              ) : (
                <motion.button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => buy(item)}
                  disabled={balance < item.price}
                  whileTap={balance >= item.price ? { scale: 0.96 } : undefined}
                >
                  Buy · {item.price} <CoinIcon size={18} />
                  <span className="sr-only">taka coins</span>
                </motion.button>
              )}
              {msg?.id === item.id && (
                <p className={`text-sm font-bold ${msg.ok ? "text-brand-dark" : "text-accent-dark"}`} role="status">
                  {msg.text}
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>
    </AppShell>
  );
}
