// File type checks by content, not extension (spec ch.11), and SSRF-safe URL validation.

export type DetectedType = "mp4" | "mov" | "jpg" | "png" | "webp" | "gif" | "pdf" | null;

export function sniff(bytes: Uint8Array): DetectedType {
  const at = (i: number, ...sig: number[]): boolean => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand === "qt  " ? "mov" : "mp4";
  }
  return null;
}

export const UPLOAD_RULES = {
  video: { types: ["mp4", "mov"] as DetectedType[], maxBytes: 95 * 1024 * 1024, label: "動画はmp4・mov" },
  banner: { types: ["jpg", "png", "webp", "gif"] as DetectedType[], maxBytes: 20 * 1024 * 1024, label: "画像はjpg・png・webp・gif" },
  screenshot: { types: ["jpg", "png", "webp"] as DetectedType[], maxBytes: 20 * 1024 * 1024, label: "画像はjpg・png・webp" },
  reference: { types: ["pdf", "jpg", "png", "webp"] as DetectedType[], maxBytes: 20 * 1024 * 1024, label: "PDF・画像" },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_RULES;

export const CONTENT_TYPE: Record<Exclude<DetectedType, null>, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/** Rejects non-http(s) schemes and private/loopback/link-local hosts (screenshot & capture URLs). */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:")) return false;
  }
  return true;
}

/** Turns LP HTML into plain text; the HTML itself is never rendered (spec ch.11). */
export function htmlToText(html: string): { title: string | null; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title: title ? htmlToText(title).text : null, text };
}
