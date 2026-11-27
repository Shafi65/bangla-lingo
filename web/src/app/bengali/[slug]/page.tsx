import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SpeakButton } from "@/components/SpeakButton";
import { ShareButton } from "@/components/wordpages/ShareButton";
import { graphemes } from "@/lib/bnNormalize";
import { SITE_URL, WORD_PAGE_ROBOTS, WORD_PAGES_PATH } from "@/lib/indexing";
import { getWordPage, wordPageParams, primaryEnglish, type WordPage } from "@/lib/wordpages/data";

export function generateStaticParams() {
  return wordPageParams();
}

const POS: Record<string, string> = {
  adj: "adjective",
  adv: "adverb",
  classifier: "counter word",
  name: "name",
  noun: "noun",
  number: "number",
  particle: "particle",
  phrase: "phrase",
  postposition: "postposition",
  pronoun: "pronoun",
  verb: "verb",
};

function titleFor(p: WordPage) {
  return `How to say “${primaryEnglish(p.en)}” in Bengali: ${p.bn} (${p.tr})`;
}

function descriptionFor(p: WordPage) {
  const base = `${p.bn} (${p.tr}) means “${p.en}” in Bengali. Hear it, see how to read it`;
  return p.lesson ? `${base}, and learn it in a free lesson.` : `${base}, and find it in your family tree.`;
}

export async function generateMetadata({ params }: PageProps<"/bengali/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = getWordPage(slug);
  if (!p) return { title: "Word not found" };
  const url = `${WORD_PAGES_PATH}/${p.slug}`;
  return {
    title: `${titleFor(p)} · BanglaLingo`,
    description: descriptionFor(p),
    alternates: { canonical: url },
    robots: WORD_PAGE_ROBOTS,
    openGraph: { type: "article", url, title: titleFor(p), description: descriptionFor(p), siteName: "BanglaLingo", locale: "en" },
    twitter: { card: "summary_large_image", title: titleFor(p), description: descriptionFor(p) },
  };
}

/** Structured data: a defined term in the course's Bengali word set. `<` is escaped so it can't end the script. */
function jsonLd(p: WordPage) {
  const data = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: p.bn,
    alternateName: [p.tr, ...p.alt],
    description: p.en,
    inLanguage: "bn",
    url: `${SITE_URL}${WORD_PAGES_PATH}/${p.slug}`,
    inDefinedTermSet: { "@type": "DefinedTermSet", name: "BanglaLingo Bengali words", url: `${SITE_URL}${WORD_PAGES_PATH}` },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function WordPageRoute({ params }: PageProps<"/bengali/[slug]">) {
  const { slug } = await params;
  const p = getWordPage(slug);
  if (!p) notFound();
  const pieces = graphemes(p.bn).filter((g) => g.trim());
  const meaning = primaryEnglish(p.en);

  return (
    <AppShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(p) }} />
      <p>
        <Link href={WORD_PAGES_PATH} className="inline-flex min-h-11 items-center font-extrabold text-brand-dark underline">
          ‹ Bengali words
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-black text-pretty">
        “{meaning}” in Bengali
      </h1>

      <section aria-label="The word" className="mt-4 rounded-3xl border-2 border-line bg-surface p-5">
        <div className="flex items-center gap-4">
          <SpeakButton bn={p.bn} size="md" />
          <div className="min-w-0">
            <p lang="bn" className="text-5xl leading-tight font-black text-pretty text-ink [overflow-wrap:anywhere]">
              {p.bn}
            </p>
            <p className="mt-1 text-xl font-extrabold text-brand-dark">{p.tr}</p>
          </div>
        </div>
        <p className="mt-3 text-lg font-bold text-pretty">
          {p.en}
          {p.alt.length > 0 && <span className="font-semibold text-muted"> · also: {p.alt.join(", ")}</span>}
        </p>
        <p className="mt-1 text-sm font-extrabold tracking-wide text-muted uppercase">{POS[p.pos] ?? p.pos}</p>
        <div className="mt-3">
          <SpeakButton bn={p.bn} size="sm" slow />
          <span className="ml-2 align-middle text-sm font-bold text-muted">Slowly</span>
        </div>
      </section>

      {p.notes && (
        <section aria-labelledby="usage" className="mt-5">
          <h2 id="usage" className="text-xl font-black">How it’s used</h2>
          <p className="mt-1 text-lg font-semibold text-pretty">{p.notes}</p>
        </section>
      )}

      {p.kolkata && (
        <p className="mt-3 rounded-2xl bg-sunk px-4 py-3 font-semibold text-pretty">
          <span className="font-black">In Kolkata (West Bengal): </span>
          {p.kolkata.bn && <span lang="bn" className="font-bold">{p.kolkata.bn}</span>}
          {p.kolkata.tr && <span className="text-muted"> ({p.kolkata.tr})</span>}
        </p>
      )}

      <section aria-labelledby="read" className="mt-5">
        <h2 id="read" className="text-xl font-black">How to read it</h2>
        <ol aria-label="Letter groups" className="mt-2 flex flex-wrap gap-2">
          {pieces.map((g, i) => (
            <li key={`${g}-${i}`} lang="bn" className="rounded-2xl border-2 border-line bg-surface px-3 py-1 text-3xl font-bold">
              {g}
            </li>
          ))}
        </ol>
        {p.conjuncts.length > 0 && (
          <ul className="mt-3 space-y-2">
            {p.conjuncts.map((c) => (
              <li key={c.conjunct} className="rounded-2xl bg-brand-light px-4 py-3">
                <p className="text-lg font-bold">
                  <span lang="bn" className="text-2xl">{c.conjunct}</span>
                  <span className="mx-2" aria-hidden>=</span>
                  {c.letters.map((l, i) => (
                    <span key={i}>
                      {i > 0 && <span className="mx-1" aria-hidden>+</span>}
                      <span lang="bn" className="text-2xl">{l}</span>
                      {c.names[i] && <span className="ml-1 text-sm font-extrabold text-muted">{c.names[i]}</span>}
                    </span>
                  ))}
                </p>
                {c.notes.map((n) => (
                  <p key={n} className="mt-1 text-sm font-semibold text-pretty">{n}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.examples.length > 0 && (
        <section aria-labelledby="examples" className="mt-5">
          <h2 id="examples" className="text-xl font-black">In a sentence</h2>
          <ul className="mt-2 space-y-2">
            {p.examples.map((ex) => (
              <li key={ex.bn} className="flex items-start gap-3 rounded-2xl border-2 border-line bg-surface p-3">
                <SpeakButton bn={ex.bn} size="sm" />
                <div className="min-w-0">
                  <p lang="bn" className="text-xl font-bold text-pretty">{ex.bn}</p>
                  <p className="text-sm font-bold text-brand-dark">{ex.tr}</p>
                  <p className="font-semibold text-pretty">{ex.en}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Learn it" className="mt-6 rounded-3xl bg-brand p-5 text-white">
        {p.lesson && p.unit ? (
          <>
            <p className="text-xl font-black">Learn it in a free lesson</p>
            <p className="mt-1 font-semibold">
              {p.unit.title} · {p.lesson.title}
            </p>
            <Link href={`/lesson/${p.lesson.id}`} className="btn mt-3 !bg-white !px-5 !text-base !text-brand-dark">
              Start the lesson
            </Link>
          </>
        ) : (
          <>
            <p className="text-xl font-black">Find it in your family</p>
            <p className="mt-1 font-semibold">Build your family tree and learn what to call each relative.</p>
            <Link href="/family" className="btn mt-3 !bg-white !px-5 !text-base !text-brand-dark">
              Open My family
            </Link>
          </>
        )}
      </section>

      <section aria-labelledby="share" className="mt-5">
        <h2 id="share" className="sr-only">Share</h2>
        <ShareButton url={`${SITE_URL}${WORD_PAGES_PATH}/${p.slug}`} text={`How to say “${meaning}” in Bengali: ${p.bn} (${p.tr})`} />
      </section>

      {p.related.length > 0 && (
        <nav aria-labelledby="related" className="mt-6">
          <h2 id="related" className="text-xl font-black">Learned in the same lesson</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {p.related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`${WORD_PAGES_PATH}/${r.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-surface px-3 py-1 font-bold hover:bg-sunk"
                >
                  <span lang="bn">{r.bn}</span>
                  <span className="text-sm text-muted">{primaryEnglish(r.en)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </AppShell>
  );
}
