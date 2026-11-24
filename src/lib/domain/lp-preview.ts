// LP preview pulled from the HTML at capture time: OGP when the page has it, and the first-view
// images otherwise (Squad beyond articles ship without OGP and lazy-load images via data-src).
import { z } from "zod";

/** https only: http images are blocked as mixed content, and nothing else belongs in an <img src>. */
const httpsUrl = z.string().url().max(2000).refine((u) => u.startsWith("https://"), "https only");

export const lpPreviewSchema = z.object({
  title: z.string().max(300).nullable(),
  description: z.string().max(1000).nullable(),
  siteName: z.string().max(200).nullable(),
  ogImage: httpsUrl.nullable(),
  images: z.array(httpsUrl).max(6),
});
export type LpPreview = z.infer<typeof lpPreviewSchema>;

const MAX_IMAGES = 6;
/** Placeholders, trackers and icons that are never the first view. */
const SKIP_IMAGE = /(lazy\.(png|gif|svg)|spacer|pixel|blank\.(gif|png)|1x1|favicon|\/icons?\/|facebook\.com\/tr|googletagmanager|doubleclick|\.svg(\?|$))/i;

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const v = m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
  return v === null ? null : decode(v);
}

function meta(html: string, keys: readonly string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (keys.includes(key)) {
      const content = attr(tag, "content");
      if (content) return content;
    }
  }
  return null;
}

function absolute(src: string | null, base: string): string | null {
  if (!src || src.startsWith("data:")) return null;
  try {
    const url = new URL(src, base);
    // Upgrade http (mixed content would be blocked); drop every other scheme.
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && url.toString().length <= 2000 ? url.toString() : null;
  } catch {
    return null;
  }
}

function tooSmall(tag: string): boolean {
  const w = Number(attr(tag, "width"));
  const h = Number(attr(tag, "height"));
  return (w > 0 && w < 80) || (h > 0 && h < 80);
}

/** Top images of the page in document order (lazy-load attributes first). */
export function firstImages(html: string, base: string, limit = MAX_IMAGES): string[] {
  const body = html.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ");
  const out: string[] = [];
  for (const tag of body.match(/<img\b[^>]*>/gi) ?? []) {
    if (tooSmall(tag)) continue;
    const src = absolute(attr(tag, "data-src") ?? attr(tag, "data-original") ?? attr(tag, "data-lazy-src") ?? attr(tag, "src"), base);
    if (!src || SKIP_IMAGE.test(src) || out.includes(src)) continue;
    out.push(src);
    if (out.length >= limit) break;
  }
  return out;
}

export function extractLpPreview(html: string, base: string): LpPreview {
  const title = meta(html, ["og:title", "twitter:title"]) ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : null);
  return {
    title: title ? title.slice(0, 300) : null,
    description: (meta(html, ["og:description", "twitter:description", "description"]) ?? null)?.slice(0, 1000) ?? null,
    siteName: meta(html, ["og:site_name"])?.slice(0, 200) ?? null,
    ogImage: absolute(meta(html, ["og:image", "og:image:url", "twitter:image"]), base),
    images: firstImages(html, base),
  };
}

/** Parses stored JSON; anything malformed is treated as "no preview". */
export function parseLpPreview(raw: unknown): LpPreview | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = lpPreviewSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The image to show for an LP: OGP first, then the first-view image. */
export const previewImage = (p: LpPreview | null): string | null => p?.ogImage ?? p?.images[0] ?? null;
