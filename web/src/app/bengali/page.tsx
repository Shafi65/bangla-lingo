import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { WORD_PAGE_ROBOTS, WORD_PAGES_PATH } from "@/lib/indexing";
import { getWordPages, primaryEnglish, type WordPage } from "@/lib/wordpages/data";

const TITLE = "Bengali words and phrases, with pronunciation";
const DESCRIPTION =
  "Everyday Bengali (Bangla) words and phrases as spoken in Bangladesh: hear each one, see how to read the script, and learn it in free lessons.";

export const metadata: Metadata = {
  title: `${TITLE} · BanglaLingo`,
  description: DESCRIPTION,
  alternates: { canonical: WORD_PAGES_PATH },
  robots: WORD_PAGE_ROBOTS,
  openGraph: { type: "website", url: WORD_PAGES_PATH, title: TITLE, description: DESCRIPTION, siteName: "BanglaLingo" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function WordPagesIndex() {
  const groups = new Map<string, { title: string; words: WordPage[] }>();
  for (const p of getWordPages()) {
    const key = p.unit?.id ?? "family";
    const g = groups.get(key) ?? { title: p.unit?.title ?? "Family words", words: [] };
    g.words.push(p);
    groups.set(key, g);
  }
  // Course units first (lexicon order follows the course), the extra family words last.
  const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === "family") - Number(b === "family"));

  return (
    <AppShell>
      <h1 className="text-3xl font-black">{TITLE}</h1>
      <p className="mt-2 text-lg font-semibold text-pretty text-muted">{DESCRIPTION}</p>
      <nav aria-label="Topics" className="mt-4">
        <ul className="flex flex-wrap gap-2">
          {ordered.map(([id, g]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-extrabold hover:bg-sunk">
                {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 space-y-8">
        {ordered.map(([id, g]) => (
          <section key={id} id={id} aria-labelledby={`${id}-h`}>
            <h2 id={`${id}-h`} className="text-2xl font-black">{g.title}</h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {g.words.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`${WORD_PAGES_PATH}/${p.slug}`}
                    className="flex min-h-11 items-baseline gap-2 rounded-2xl border-2 border-line bg-surface px-3 py-2 hover:bg-sunk"
                  >
                    <span lang="bn" className="text-xl font-bold">{p.bn}</span>
                    <span className="text-sm font-bold text-brand-dark">{p.tr}</span>
                    <span className="ml-auto text-right text-sm font-semibold text-muted">{primaryEnglish(p.en)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
