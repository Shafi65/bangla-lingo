// Pure: typo tolerance for the course search (Damerau-Levenshtein, optimal string alignment).

/**
 * Edit distance between `a` and `b` counting an insertion, deletion, substitution or swap of two
 * neighbouring letters as one step. Returns `max + 1` as soon as the distance is known to exceed `max`.
 */
export function damerau(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0 || lb === 0) return Math.max(la, lb) <= max ? Math.max(la, lb) : max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] <= max ? prev[lb] : max + 1;
}

/**
 * How many typos to forgive in a word of this length: none under 4 letters (too many real words are
 * one letter apart), one for 4-7 letters, two for 8 or more.
 */
export function allowedTypos(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

/** Distance between two normalized strings when it is within what `allowedTypos` forgives, else -1. */
export function typoDistance(query: string, key: string): number {
  const max = allowedTypos(query.length);
  if (max === 0) return -1;
  const d = damerau(query, key, max);
  return d >= 1 && d <= max ? d : -1;
}
