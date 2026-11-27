// Server-only: the 1200×630 share card for a word page (shown when a link is pasted into WhatsApp,
// Messenger, social media). Bengali is drawn as a pre-shaped SVG (see bengali-svg.ts).
import "server-only";
import fs from "node:fs";
import { ImageResponse } from "next/og";
import { bengaliSvg, fontsourceFile } from "./bengali-svg";

export const CARD_SIZE = { width: 1200, height: 630 };

const BRAND = "#006a4e";
const BRAND_EDGE = "#004332";
const CREAM = "#fdfaf3";
const ACCENT = "#f42a41";

let fonts: { name: string; data: Buffer; weight: 800 | 900; style: "normal" }[] | undefined;
function latinFonts() {
  return (fonts ??= ([800, 900] as const).map((weight) => ({
    name: "Nunito",
    data: fs.readFileSync(fontsourceFile("@fontsource/nunito", `nunito-latin-${weight}-normal.woff`)),
    weight,
    style: "normal" as const,
  })));
}

/** Largest Bengali size that keeps the word within `maxWidth`, between 56 and 180 px per em. */
export function fitBengali(bn: string, maxWidth: number) {
  let size = 180;
  let svg = bengaliSvg(bn, { size, color: CREAM });
  while (svg.width > maxWidth && size > 56) {
    size = Math.max(56, Math.floor((size * maxWidth) / svg.width));
    svg = bengaliSvg(bn, { size, color: CREAM });
  }
  return svg;
}

/** Width available to the Bengali word on the card. */
export const WORD_MAX_WIDTH = CARD_SIZE.width - 160;

export function wordCard({ bn, tr, en, kicker }: { bn: string; tr: string; en: string; kicker: string }): ImageResponse {
  const word = fitBengali(bn, WORD_MAX_WIDTH);
  const english = en.length > 60 ? `${en.slice(0, 57).trimEnd()}…` : en;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND,
          borderBottom: `24px solid ${BRAND_EDGE}`,
          padding: "56px 80px 40px",
          fontFamily: "Nunito",
          color: CREAM,
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, opacity: 0.85 }}>{kicker}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> only */}
          <img src={word.src} width={word.width} height={word.height} alt="" />
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, marginTop: 4 }}>{tr}</div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, marginTop: 8, color: "#ffe8b0" }}>“{english}”</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 32, fontWeight: 900 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: ACCENT, marginRight: 14 }} />
            BanglaLingo
          </div>
          <div style={{ display: "flex", fontWeight: 800, opacity: 0.85 }}>Learn Bengali free</div>
        </div>
      </div>
    ),
    { ...CARD_SIZE, fonts: latinFonts() },
  );
}
