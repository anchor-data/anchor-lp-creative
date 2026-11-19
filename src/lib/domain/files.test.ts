import { describe, expect, it } from "vitest";
import { htmlToText, isSafePublicUrl, sniff } from "./files";

describe("sniff", () => {
  it("detects by magic bytes, not extension", () => {
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniff(mp4)).toBe("mp4");
    expect(sniff(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("isSafePublicUrl", () => {
  it("rejects private and non-http targets", () => {
    expect(isSafePublicUrl("https://example.com/lp")).toBe(true);
    expect(isSafePublicUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isSafePublicUrl("http://10.0.0.5")).toBe(false);
    expect(isSafePublicUrl("http://192.168.1.1")).toBe(false);
    expect(isSafePublicUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isSafePublicUrl("http://localhost:3000")).toBe(false);
    expect(isSafePublicUrl("http://[::1]/")).toBe(false);
    expect(isSafePublicUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("drops scripts and tags", () => {
    const r = htmlToText("<title>LP</title><script>alert(1)</script><p>本文&amp;説明</p>");
    expect(r.title).toBe("LP");
    expect(r.text).toBe("LP 本文&説明");
  });
});
