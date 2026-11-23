// Credit lines for third-party material (docs/LICENSING.md). Pure: no fs, safe on the client.

export type CreatorRole =
  | "author"
  | "illustrator"
  | "translator"
  | "reader"
  | "photographer"
  | "compiler"
  | "designer"
  | "editor";

export interface Creator {
  name: string;
  role: CreatorRole;
}

export interface Licence {
  id: string;
  name: string;
  url: string;
  allowed: boolean;
  attribution?: boolean;
  shareAlike?: boolean;
  publicDomain?: boolean;
}

/** The `source` block every imported item carries (content/library/<kind>/<id>.json). */
export interface Source {
  title: string;
  titleBn?: string;
  creators?: Creator[];
  publisher?: string;
  platform?: string;
  funder?: string;
  url: string;
  licence: string;
  modified?: boolean;
  changes?: string;
  published?: number;
  authorDied?: number;
  variety?: "bd" | "in" | "both";
}

export type LibraryKind = "stories" | "words" | "audio" | "media";

export interface LibraryCredit {
  id: string;
  kind: LibraryKind;
  source: Source;
}

export interface AppCredit {
  id: string;
  kind: "font" | "model" | "service" | "data";
  title: string;
  creators?: Creator[];
  url: string;
  licence?: string;
  note?: string;
}

/** Plain-language credit, e.g. for StoryWeaver: title, people, publisher/platform/funder, licence, changes. */
export interface CreditParts {
  title: string;
  people: string | null;
  from: string | null;
  licenceName: string | null;
  licenceUrl: string | null;
  changes: string | null;
}

const ROLE_ORDER: CreatorRole[] = ["author", "compiler", "translator", "illustrator", "photographer", "reader", "editor", "designer"];

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "written by A, translated by B, illustrated by C" */
export function describePeople(creators: Creator[] | undefined): string | null {
  if (!creators?.length) return null;
  const verb: Record<CreatorRole, string> = {
    author: "written by",
    compiler: "collected by",
    translator: "translated by",
    illustrator: "illustrated by",
    photographer: "photo by",
    reader: "read by",
    editor: "edited by",
    designer: "designed by",
  };
  const parts: string[] = [];
  for (const role of ROLE_ORDER) {
    const names = creators.filter((c) => c.role === role).map((c) => c.name);
    if (names.length) parts.push(`${verb[role]} ${joinNames(names)}`);
  }
  return parts.join(", ");
}

export function creditParts(source: Source, licences: Map<string, Licence>): CreditParts {
  const lic = licences.get(source.licence);
  const from: string[] = [];
  if (source.publisher) from.push(`published by ${source.publisher}`);
  if (source.platform) from.push(`${source.publisher ? "on" : "from"} ${source.platform}`);
  if (source.funder) from.push(`supported by ${source.funder}`);
  const people = describePeople(source.creators);
  const year = lic?.publicDomain && source.published ? ` (${source.published})` : "";
  return {
    title: `${source.title}${year}`,
    people,
    from: from.length ? from.join(" ") : null,
    licenceName: lic ? lic.name : source.licence,
    licenceUrl: lic?.url ?? null,
    changes: source.modified ? (source.changes ?? "Adapted for BanglaLingo.") : null,
  };
}

/** One-line text version (for compact "ⓘ Credits" lines and tests). */
export function creditLine(source: Source, licences: Map<string, Licence>): string {
  const p = creditParts(source, licences);
  const bits = [`“${p.title}”`];
  if (p.people) bits.push(p.people);
  if (p.from) bits.push(p.from);
  let line = bits.join(", ");
  line += p.licenceName ? `. ${p.licenceName}.` : ".";
  if (p.changes) line += ` Changes: ${p.changes}`;
  return line;
}

export const KIND_TITLES: Record<LibraryKind, string> = {
  stories: "Stories",
  words: "Dictionary data",
  audio: "Audio",
  media: "Photos and video",
};
