import { describe, expect, it } from "vitest";
import {
  creativeId,
  isActiveStatus,
  joinUrl,
  mapMedia,
  parseArticles,
  parseOperationRows,
  parsePagesResponse,
  pageMediaFromRaw,
} from "./squad-beyond-mapping";

const PAGE = {
  id: 12, uid: "ab-uid-1", title: "Diet LP", ad_status: "delivered", delivery_url: "https://lp.example.com/a",
  media: { id: 1, name: "Meta", icon_name: "meta", ad_cooperation: true },
  folder: { id: 3, uid: "f-1", name: "Client A" },
};

describe("joinUrl", () => {
  it("keeps the base path whether or not either side has a slash", () => {
    expect(joinUrl("https://public-api.squadbeyond.com/v1", "ab_tests")).toBe("https://public-api.squadbeyond.com/v1/ab_tests");
    expect(joinUrl("https://public-api.squadbeyond.com/v1/", "/ab_tests")).toBe("https://public-api.squadbeyond.com/v1/ab_tests");
  });
});

describe("mapMedia", () => {
  it("maps names exactly and by containment, falling back to other", () => {
    expect(mapMedia("Meta")).toBe("meta");
    expect(mapMedia("Yahoo!広告")).toBe("yahoo");
    expect(mapMedia("X(Twitter)")).toBe("x");
    expect(mapMedia("TikTok")).toBe("tiktok");
    expect(mapMedia("Unknown Network")).toBe("other");
    expect(mapMedia("")).toBe("other");
  });
});

describe("isActiveStatus", () => {
  it("treats only delivering pages (and unknown statuses) as active", () => {
    expect(isActiveStatus("delivered")).toBe(true);
    expect(isActiveStatus("prepared")).toBe(false);
    expect(isActiveStatus("undelivered")).toBe(false);
    expect(isActiveStatus("something_new")).toBe(true);
    expect(isActiveStatus(null)).toBe(true);
  });
});

describe("parsePagesResponse", () => {
  it("uses the UID as id and reads pagination", () => {
    const r = parsePagesResponse({ pagination: { total_pages: 2, total_count: 101, current_page: 1 }, ab_tests: [PAGE] });
    expect(r.totalPages).toBe(2);
    expect(r.pages).toEqual([{ id: "ab-uid-1", name: "Diet LP", folder: "Client A", status: "active", url: "https://lp.example.com/a", media: "meta", raw: PAGE }]);
  });

  it("rejects a response without ab_tests", () => {
    expect(() => parsePagesResponse({ pagination: {} })).toThrow();
  });
});

describe("pageMediaFromRaw", () => {
  it("reads media.name from stored raw JSON", () => {
    expect(pageMediaFromRaw(JSON.stringify(PAGE))).toBe("meta");
    expect(pageMediaFromRaw(null)).toBe("other");
    expect(pageMediaFromRaw("not json")).toBe("other");
  });
});

describe("parseArticles", () => {
  it("maps versions, naming them by memo and skipping archived ones", () => {
    const versions = parseArticles("ab-uid-1", {
      articles: [
        { uid: "v1", memo: "FV赤", archived: false },
        { uid: "v2", memo: "", archived: false },
        { uid: "v3", memo: "old", archived: true },
      ],
    });
    expect(versions.map((v) => [v.id, v.name, v.pageId])).toEqual([["v1", "FV赤", "ab-uid-1"], ["v2", "v2", "ab-uid-1"]]);
  });
});

describe("parseOperationRows", () => {
  const body = {
    rows: [
      { date: "2026-11-23", article_uid: "v1", parameter: "cr_01", ad_spending: 1200.4, pv: 300, click: 40, ctr: 13.3, cv: 3, cvr: 7.5, ctvr: 1, cpa: 400, mcpa: 300, fver: 50, sver: 30, fsver: 20, oar: 10, media_imp: 9000, media_ctr: 1.2, media_cpm: 800, media_cpc: 60, media_click: 108 },
      { date: "2026-11-23", article_uid: "v1", parameter: null, ad_spending: null, pv: 5, click: 0, ctr: null, cv: 0, cvr: null, ctvr: null, cpa: null, mcpa: null, fver: null, sver: null, fsver: null, oar: null, media_imp: null, media_ctr: null, media_cpm: null, media_cpc: null, media_click: null },
      { date: "2026-11-23", article_uid: null, parameter: "cr_01", pv: 1 },
    ],
  };

  it("maps daily rows to version × creative and skips rows without a version", () => {
    const rows = parseOperationRows("ab-uid-1", "2026-11-23", "meta", body);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-11-23", versionId: "v1", creativeId: creativeId("ab-uid-1", "cr_01"), parameter: "cr_01", media: "meta", spend: 1200.4, pv: 300, mcv: null, mediaCpc: 60 });
    expect(rows[1]).toMatchObject({ creativeId: creativeId("ab-uid-1", null), parameter: null, spend: null });
  });

  it("rejects a response without rows", () => {
    expect(() => parseOperationRows("ab-uid-1", "2026-11-23", "meta", {})).toThrow();
  });
});
