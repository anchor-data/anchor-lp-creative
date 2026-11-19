import { describe, expect, it } from "vitest";
import { checkExpressions, type NgExpression } from "./expressions";

const dict: NgExpression[] = [
  { phrase: "痩せる", matchType: "contains", law: "薬機法", alternative: "すっきり", severity: "ng" },
  { phrase: "No\\.?1", matchType: "regex", law: "景品表示法", alternative: null, severity: "warn" },
  { phrase: "([", matchType: "regex", law: null, alternative: null, severity: "warn" },
];

describe("checkExpressions", () => {
  it("finds contains and regex matches per field", () => {
    const hits = checkExpressions({ copy: "飲むだけで痩せる！業界No.1", title: "問題なし" }, dict);
    expect(hits.map((h) => h.phrase)).toEqual(["痩せる", "No\\.?1"]);
    expect(hits[0]).toMatchObject({ field: "copy", law: "薬機法", severity: "ng" });
  });

  it("ignores invalid regex entries and empty fields", () => {
    expect(checkExpressions({ a: null, b: "" }, dict)).toEqual([]);
  });
});
