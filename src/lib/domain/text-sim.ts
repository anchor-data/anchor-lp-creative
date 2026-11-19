// Character-bigram similarity. Used when no embedding is available (local dev, AI binding
// down) for recommendations, and for the "参照事例の表現に近い" check on generated copy.

function bigrams(text: string): Set<string> {
  const s = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Jaccard over character bigrams, 0..1 */
export function bigramSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Share of the query's bigrams found in the document (better for short query vs long doc). */
export function bigramCoverage(query: string, doc: string): number {
  const Q = bigrams(query);
  const D = bigrams(doc);
  if (Q.size === 0) return 0;
  let hit = 0;
  for (const g of Q) if (D.has(g)) hit++;
  return hit / Q.size;
}
