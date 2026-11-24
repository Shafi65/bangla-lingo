// Pure: make two spellings of the same Bengali text compare equal.
//
// Phone keyboards and copy-paste often leave invisible format characters (zero-width joiners) or
// doubled marks in text that looks identical on screen, so a correct typed answer could be marked
// wrong. Rules adapted from bnUnicodeNormalizer by Nazmuddoha Ansary (MIT licence,
// https://github.com/mnansary/bnUnicodeNormalizer); only the subset that is safe for comparing a
// learner's answer is applied here.

/** Zero-width space, non-joiner, joiner, word joiner, byte-order mark, soft hyphen. */
const INVISIBLE = /[​‌‍⁠﻿­]/g;
const HASANTA = "্";
const KHANDA_TA = "ৎ";

/**
 * Normalise Bengali text for comparison (safe on any text: non-Bengali characters only lose the
 * invisible format characters above).
 *
 * - ত্ + zero-width joiner, and a word-final ত্, become ৎ (khanda ta), the way most keyboards write it.
 * - Invisible format characters are removed.
 * - A doubled hasanta (্্) becomes one.
 * - A vowel sign or mark typed twice in a row (e.g. ি ি, ঁঁ) becomes one.
 * - Unicode NFC, so composed and decomposed forms (ো vs ে + া, য় vs য + ়) match.
 */
export function normalizeBengali(s: string): string {
  return s
    .normalize("NFC")
    .replace(/ত্‍/g, KHANDA_TA)
    .replace(INVISIBLE, "")
    .replace(/ত্(?![ঀ-৿])/g, KHANDA_TA)
    .replace(/্{2,}/g, HASANTA)
    .replace(/([ঁ-ঃ়া-ৌৗ])\1+/g, "$1")
    .normalize("NFC");
}

const BENGALI = /[ঀ-৿]/;

/** True when the text contains any Bengali-script character. */
export function hasBengali(s: string): boolean {
  return BENGALI.test(s);
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("bn", { granularity: "grapheme" }) : null;

/**
 * Split into user-perceived characters, keeping a conjunct with its vowel sign together
 * (স্কু, ক্ষ, রে…). Falls back to code points where Intl.Segmenter is missing.
 */
export function graphemes(s: string): string[] {
  if (!segmenter) return Array.from(s);
  return Array.from(segmenter.segment(s), (g) => g.segment);
}
