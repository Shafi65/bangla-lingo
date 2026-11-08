/** Inline markdown: **bold**, *italic*, `code` (rendered as transliteration). */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).map((chunk, j) => {
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4)
          return <strong key={j} className="font-black text-brand-dark">{chunk.slice(2, -2)}</strong>;
        if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2)
          return <em key={j} className="text-brand-dark">{chunk.slice(1, -1)}</em>;
        if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2)
          return <em key={j}>{chunk.slice(1, -1)}</em>;
        return chunk;
      })}
    </>
  );
}

/** Tiny renderer for lesson tips: paragraphs, "- " bullet lists, and inline markdown. */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^[-•]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (isItem && last?.list) last.lines.push(line.replace(/^[-•]\s+/, ""));
    else blocks.push({ list: isItem, lines: [isItem ? line.replace(/^[-•]\s+/, "") : line] });
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className={`list-disc space-y-1 pl-5 ${i ? "mt-2" : ""}`}>
            {b.lines.map((l, j) => (
              <li key={j}><Inline text={l} /></li>
            ))}
          </ul>
        ) : (
          <p key={i} className={i ? "mt-2" : ""}><Inline text={b.lines[0]} /></p>
        ),
      )}
    </>
  );
}
