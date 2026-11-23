import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getCredits } from "@/lib/credits/data";
import { KIND_TITLES, creditParts, describePeople, type LibraryKind, type Licence, type Source } from "@/lib/credits/format";

export const metadata: Metadata = { title: "Credits · BanglaLingo" };

const KIND_ORDER: LibraryKind[] = ["stories", "words", "audio", "media"];

export default function CreditsPage() {
  const { licences, app, library } = getCredits();
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Credits</h1>
      <p className="mt-1 max-w-2xl font-semibold text-muted">
        BanglaLingo&apos;s lessons are written for the app. Stories, recordings, photos and data from other people are
        used under open licences and credited here.
      </p>

      <div className="mt-6 flex max-w-2xl flex-col gap-4" data-testid="credits">
        {KIND_ORDER.map((kind) => {
          const items = library.filter((i) => i.kind === kind);
          if (!items.length) return null;
          return (
            <section key={kind} className="card p-5" data-testid={`credits-${kind}`}>
              <h2 className="text-lg font-black">{KIND_TITLES[kind]}</h2>
              <ul className="mt-2 flex flex-col gap-3">
                {items.map((i) => (
                  <li key={i.id}>
                    <SourceCredit source={i.source} licences={licences} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {library.length === 0 && (
          <section className="card p-5">
            <h2 className="text-lg font-black">Stories and recordings</h2>
            <p className="mt-1 font-semibold text-muted">None yet. Openly licensed stories are coming soon.</p>
          </section>
        )}

        <section className="card p-5" data-testid="credits-app">
          <h2 className="text-lg font-black">Fonts and services</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {app.map((c) => {
              const lic = c.licence ? licences.get(c.licence) : undefined;
              const people = describePeople(c.creators);
              return (
                <li key={c.id} className="font-semibold text-muted">
                  <a href={c.url} className="font-bold text-ink underline" rel="noopener noreferrer" target="_blank">
                    {c.title}
                  </a>
                  {people && <>, {people}</>}
                  {lic && (
                    <>
                      .{" "}
                      <LicenceLink licence={lic} />
                    </>
                  )}
                  {c.note && <>{lic ? " " : ". "}{c.note}</>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <p className="mt-6 text-sm font-semibold text-muted">
        <Link href="/settings" className="font-bold text-brand-dark underline">
          Back to settings
        </Link>
      </p>
    </AppShell>
  );
}

function LicenceLink({ licence }: { licence: Licence }) {
  return (
    <a href={licence.url} className="underline" rel="noopener noreferrer license" target="_blank">
      {licence.name}
    </a>
  );
}

function SourceCredit({ source, licences }: { source: Source; licences: Map<string, Licence> }) {
  const p = creditParts(source, licences);
  const lic = licences.get(source.licence);
  return (
    <p className="font-semibold text-muted">
      <a href={source.url} className="font-bold text-ink underline" rel="noopener noreferrer" target="_blank">
        {p.title}
      </a>
      {source.titleBn && (
        <span lang="bn">
          {" "}
          ({source.titleBn})
        </span>
      )}
      {p.people && <>, {p.people}</>}
      {p.from && <>, {p.from}</>}
      {lic && (
        <>
          .{" "}
          <LicenceLink licence={lic} />.
        </>
      )}
      {p.changes && <> Changes: {p.changes}</>}
    </p>
  );
}
