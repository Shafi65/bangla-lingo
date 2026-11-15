// Number formatting for the profile. Pure.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Western digits to Bengali digits, other characters kept: "1,250" -> "১,২৫০". */
export function bnDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** 1,284 / 12.9K: full under 10,000, compact above. */
export function compact(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
