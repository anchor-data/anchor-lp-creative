import { describe, expect, it } from "vitest";
import {
  creativeId,
  dateChunks,
  hasMoreBatches,
  isActiveStatus,
  joinUrl,
  mapMedia,
  parseArticles,
  parseSbUrl,
  parseUrlSearchResponse,
  parseVersionSummaryRow,
  combineVersionTotals,
  sbVersionIdFromUrl,
  isSbResolvableUrl,
  sbVersionUrl,
  parseOperationRows,
  parsePagesResponse,
  parseRankingsResponse,
  pageMediaFromRaw,
  selectCreativeRows,
  type SbOperationRow,
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

describe("dateChunks", () => {
  it("splits a period into ranges of at most 30 days, newest first", () => {
    expect(dateChunks("2026-11-23", 7)).toEqual([["2026-11-17", "2026-11-23"]]);
    expect(dateChunks("2026-11-23", 30)).toEqual([["2026-10-25", "2026-11-23"]]);
    expect(dateChunks("2026-11-23", 65)).toEqual([
      ["2026-10-25", "2026-11-23"],
      ["2026-09-25", "2026-10-24"],
      ["2026-09-20", "2026-09-24"],
    ]);
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

describe("parseRankingsResponse", () => {
  it("maps ranked pages with their page views and pagination", () => {
    const body = {
      pagination: { total_pages: 5, total_count: 14, current_page: 1 },
      ab_tests: [
        { uid: "p1", title: "LP 1", ad_status: "delivered", delivery_url: "https://a", media: { name: "TikTok" }, metrics: { page_view_count: 1200 } },
        { uid: "p2", title: "LP 2", ad_status: "undelivered", media: { name: "Meta" }, metrics: { page_view_count: 0 } },
      ],
    };
    const r = parseRankingsResponse(body);
    expect(r.totalPages).toBe(5);
    expect(r.pages.map((p) => [p.id, p.media, p.status, p.pageViews])).toEqual([["p1", "tiktok", "active", 1200], ["p2", "meta", "inactive", 0]]);
    expect(r.pages[0].folder).toBeNull();
  });
});

describe("hasMoreBatches", () => {
  it("stops at the last ranking page or once pages without views appear", () => {
    expect(hasMoreBatches(1, 5, 3, 3)).toBe(true);
    expect(hasMoreBatches(5, 5, 3, 3)).toBe(false);
    expect(hasMoreBatches(2, 5, 3, 1)).toBe(false);
    expect(hasMoreBatches(1, 1, 0, 0)).toBe(false);
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

  it("gives every version its own console URL", () => {
    const [v] = parseArticles("ab-uid-1", { articles: [{ uid: "v1", memo: "x" }] });
    expect(v.url).toBe("https://app.squadbeyond.com/ab_tests/ab-uid-1/versions/swipe?version=v1");
  });
});

describe("parseSbUrl", () => {
  it("reads page and version from a console URL", () => {
    expect(parseSbUrl("https://app.squadbeyond.com/ab_tests/skincare_meta_002_neck/versions/swipe?version=iYmYQvvIKmOUAPByMZxA")).toEqual({ pageId: "skincare_meta_002_neck", versionId: "iYmYQvvIKmOUAPByMZxA" });
    expect(parseSbUrl(sbVersionUrl("p 1", "v1"))).toEqual({ pageId: "p 1", versionId: "v1" });
  });
  it("accepts a page URL without a version and rejects other hosts", () => {
    expect(parseSbUrl("https://app.squadbeyond.com/ab_tests/abc/versions")).toEqual({ pageId: "abc", versionId: null });
    expect(parseSbUrl("https://example.com/ab_tests/abc")).toBeNull();
    expect(parseSbUrl("abc")).toBeNull();
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
    expect(rows[0]).toMatchObject({ date: "2026-11-23", versionId: "v1", creativeId: creativeId("ab-uid-1", "cr_01"), parameter: "cr_01", media: "meta", spend: 1200.4, pv: 300, mcv: 40, mcvr: 13.3, mediaCpc: 60 });
    expect(rows[1]).toMatchObject({ creativeId: creativeId("ab-uid-1", null), parameter: null, spend: null });
  });

  it("rejects a response without rows", () => {
    expect(() => parseOperationRows("ab-uid-1", "2026-11-23", "meta", {})).toThrow();
  });
});

describe("selectCreativeRows", () => {
  const row = (parameter: string | null, spend: number | null): SbOperationRow => ({
    date: "2026-11-23", versionId: "v1", creativeId: creativeId("p", parameter), parameter, media: "tiktok",
    spend, pv: 10, click: 1, ctr: null, cv: 0, cvr: null, ctvr: null, cpa: null, mcv: null, mcvr: null, mcpa: null,
    fver: null, sver: null, fsver: null, oar: null, mediaImp: null, mediaCtr: null, mediaCpm: null, mediaCpc: null, raw: {},
  });

  it("keeps only parameter keys that carry spend (utm breakdowns double-count traffic)", () => {
    const rows = [row("snuuid=a", 500), row("snuuid=b", 0), row("utm_source=tiktok", 0), row("utm_id=1", null), row("param1=x", 20)];
    expect(selectCreativeRows(rows).map((r) => r.parameter)).toEqual(["snuuid=a", "snuuid=b", "param1=x"]);
  });

  it("keeps every row when no key has spend (pages without ad cooperation)", () => {
    const rows = [row("utm_source=line", 0), row(null, null)];
    expect(selectCreativeRows(rows)).toHaveLength(2);
  });
});

describe("Squad beyond URL resolution helpers", () => {
  it("finds the version UID in preview, delivery and console URLs", () => {
    expect(sbVersionIdFromUrl("https://sb-draft-preview.squadbeyond.com/articles/iYmYQvvIKmOUAPByMZxA/draft?token=x")).toBe("iYmYQvvIKmOUAPByMZxA");
    expect(sbVersionIdFromUrl("https://lifenews-web.com/articles/abcdefgh123")).toBe("abcdefgh123");
    expect(sbVersionIdFromUrl("https://app.squadbeyond.com/ab_tests/p1/versions/swipe?version=vX12345")).toBe("vX12345");
    expect(sbVersionIdFromUrl("https://lifenews-web.com/ab/skincare_meta_002_neck")).toBeNull();
    expect(sbVersionIdFromUrl("nope")).toBeNull();
  });

  it("knows which URLs url_search can resolve", () => {
    expect(isSbResolvableUrl("https://lifenews-web.com/ab/skincare_meta_002_neck")).toBe(true);
    expect(isSbResolvableUrl("https://sb-draft-preview.squadbeyond.com/articles/iYmYQvvIKmOUAPByMZxA/draft")).toBe(true);
    expect(isSbResolvableUrl("https://aurelie.tokyo/lp?u=x")).toBe(false);
  });

  it("maps a url_search hit and treats {} as no match", () => {
    expect(parseUrlSearchResponse({ uid: "p1", title: "002", ad_status: "active", delivery_url: "https://x/ab/p1", media: { name: "Meta(旧Facebook)" }, folder: { name: "Meta" } }))
      .toMatchObject({ id: "p1", name: "002", folder: "Meta", status: "active", url: "https://x/ab/p1" });
    expect(parseUrlSearchResponse({})).toBeNull();
  });
});

describe("version totals", () => {
  const body = { rows: [
    { article_uid: "v1", ad_spending: 22834932, pv: 119848, click: 10329, cv: 1874, fsver: 54.28, oar: 12.6 },
    { article_uid: "v2", ad_spending: 5, pv: 1, click: 0, cv: 0, fsver: null, oar: null },
  ] };

  it("picks the version's row; click is the MCV", () => {
    expect(parseVersionSummaryRow(body, "v1")).toEqual({ spend: 22834932, pv: 119848, mcv: 10329, cv: 1874, fsver: 54.28, oar: 12.6 });
    expect(parseVersionSummaryRow(body, "missing")).toBeNull();
  });

  it("adds counts and PV-weights rates across chunks", () => {
    const t = combineVersionTotals([
      { spend: 100, pv: 100, mcv: 10, cv: 1, fsver: 50, oar: 10 },
      { spend: 300, pv: 300, mcv: 30, cv: 3, fsver: 60, oar: null },
    ], 60);
    expect(t).toEqual({ spend: 400, pv: 400, mcv: 40, cv: 4, fsver: 57.5, oar: 10, days: 60 });
  });
});
