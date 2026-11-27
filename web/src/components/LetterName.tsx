import { letterName } from "@/lib/letterNames";

/** A letter's name, small, under its glyph: "ক · ko", "তালব্য শ · talobbo sho". Nothing for other text. */
export function LetterName({ bn, className = "" }: { bn: string; className?: string }) {
  const n = letterName(bn);
  if (!n) return null;
  return (
    <span data-testid="letter-name" className={`block text-xs font-bold text-pretty text-muted ${className}`}>
      <span className="sr-only">Letter name: </span>
      <span lang="bn" className="font-bengali">{n.label}</span>
      <span aria-hidden> · </span>
      <span>{n.tr}</span>
    </span>
  );
}
