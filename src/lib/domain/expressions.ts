// 表現チェック (F-36): NG表現辞書との照合. 補助であり、最終判断は人が行う.

export interface NgExpression {
  phrase: string;
  matchType: "contains" | "regex";
  law: string | null;
  alternative: string | null;
  severity: "warn" | "ng";
}

export interface ExpressionHit {
  text: string; // matched excerpt
  phrase: string;
  law: string | null;
  alternative: string | null;
  severity: "warn" | "ng";
  field: string;
}

export function checkExpressions(fields: Record<string, string | null | undefined>, dict: readonly NgExpression[]): ExpressionHit[] {
  const hits: ExpressionHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    for (const ng of dict) {
      const match = findMatch(value, ng);
      if (match !== null) {
        hits.push({ text: excerpt(value, match.index, match.length), phrase: ng.phrase, law: ng.law, alternative: ng.alternative, severity: ng.severity, field });
      }
    }
  }
  return hits;
}

function findMatch(value: string, ng: NgExpression): { index: number; length: number } | null {
  if (ng.matchType === "regex") {
    try {
      const m = new RegExp(ng.phrase, "u").exec(value);
      return m ? { index: m.index, length: m[0].length } : null;
    } catch {
      return null; // invalid admin regex: skip rather than break the screen
    }
  }
  const index = value.indexOf(ng.phrase);
  return index >= 0 ? { index, length: ng.phrase.length } : null;
}

function excerpt(value: string, index: number, length: number): string {
  const start = Math.max(0, index - 15);
  const end = Math.min(value.length, index + length + 15);
  return `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
}
