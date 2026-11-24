import { describe, expect, it } from "vitest";
import { driveFileId, drivePreviewUrl } from "./drive";
import { extractLpPreview, firstImages, parseLpPreview, previewImage } from "./lp-preview";
import { frameTimes, parseVideoAnalysis } from "./video-analysis";

describe("driveFileId", () => {
  it("reads /file/d/{id}/view links", () => {
    expect(driveFileId("https://drive.google.com/file/d/15UF5ThhAq3iHsyBIFZFIPZ4KUWoioyAq/view")).toBe("15UF5ThhAq3iHsyBIFZFIPZ4KUWoioyAq");
  });
  it("reads open?id= and uc?id= links", () => {
    expect(driveFileId("https://drive.google.com/open?id=abcdefghijk123")).toBe("abcdefghijk123");
    expect(driveFileId("https://drive.google.com/uc?id=abcdefghijk123&export=download")).toBe("abcdefghijk123");
  });
  it("rejects other hosts and junk", () => {
    expect(driveFileId("https://example.com/file/d/abcdefghijk123/view")).toBeNull();
    expect(driveFileId("not a url")).toBeNull();
    expect(driveFileId(null)).toBeNull();
  });
  it("builds the embed URL", () => {
    expect(drivePreviewUrl("abc")).toBe("https://drive.google.com/file/d/abc/preview");
  });
});

describe("LP preview", () => {
  const sbHtml = `<html><head><title>記事</title></head><body>
    <img src="https://file.mysquadbeyond.com/lazy.png" width="593" height="342" class="lazyload" data-src="https://file.mysquadbeyond.com/uploads/a.png">
    <img src="/icons/x.png" width="16" height="16">
    <img data-src="https://file.mysquadbeyond.com/uploads/b.png">
    <img src="https://file.mysquadbeyond.com/uploads/a.png">
    <script>var s='<img src="https://evil/x.png">'</script>
  </body></html>`;

  it("takes lazy data-src images in order, skipping placeholders, icons and duplicates", () => {
    expect(firstImages(sbHtml, "https://sb.example/articles/1")).toEqual(["https://file.mysquadbeyond.com/uploads/a.png", "https://file.mysquadbeyond.com/uploads/b.png"]);
  });

  it("prefers OGP and resolves relative URLs", () => {
    const html = `<head><meta property="og:title" content="首シワ &amp; 対策"><meta property="og:image" content="/og.jpg"><meta name="description" content="説明"></head>`;
    const p = extractLpPreview(html, "https://lp.example/a/b");
    expect(p).toMatchObject({ title: "首シワ & 対策", description: "説明", ogImage: "https://lp.example/og.jpg" });
    expect(previewImage(p)).toBe("https://lp.example/og.jpg");
  });

  it("falls back to <title> and the first image", () => {
    const p = extractLpPreview(sbHtml, "https://sb.example/");
    expect(p.title).toBe("記事");
    expect(previewImage(p)).toBe("https://file.mysquadbeyond.com/uploads/a.png");
  });

  it("parses stored JSON defensively", () => {
    expect(parseLpPreview("{bad")).toBeNull();
    expect(parseLpPreview(null)).toBeNull();
    expect(parseLpPreview(JSON.stringify({ title: null, description: null, siteName: null, ogImage: null, images: [] }))).not.toBeNull();
  });
});

describe("video analysis helpers", () => {
  it("spreads frames over the clip with at most `max` samples", () => {
    const t = frameTimes(30, 24);
    expect(t).toHaveLength(24);
    expect(t[0]).toBe(0);
    expect(t.at(-1)).toBeLessThan(30);
  });
  it("keeps at least 1s between frames on short clips", () => {
    expect(frameTimes(5, 24)).toHaveLength(5);
    expect(frameTimes(0)).toEqual([0]);
  });
  it("rejects malformed stored analysis", () => {
    expect(parseVideoAnalysis("{}")).toBeNull();
  });
});
