// LP preview: OGP card when the page has OGP, otherwise the first-view images stacked like the LP top.
import type { LpPreview } from "@/lib/domain/lp-preview";

interface LpPreviewImageProps {
  preview: LpPreview | null;
  /** Uploaded screenshot (R2 key); wins over the captured images. */
  screenshotKey?: string | null;
  className?: string;
  emptyLabel?: string;
}

/** Tall LP thumbnail: screenshot, else OGP image, else the first-view images in page order. */
export function LpPreviewImage({ preview, screenshotKey, className = "", emptyLabel = "プレビューなし" }: LpPreviewImageProps) {
  const images = screenshotKey ? [`/api/files/${screenshotKey}`] : preview?.ogImage ? [preview.ogImage] : (preview?.images ?? []);
  return (
    <div className={`overflow-y-auto overflow-x-hidden bg-thumb-2 ${className}`}>
      {images.length > 0 ? (
        images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- external LP images and private R2 files
          <img key={src} src={src} alt={i === 0 ? "記事LPのファーストビュー" : ""} className="block w-full h-auto" loading={i === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" />
        ))
      ) : (
        <div className="h-full min-h-24 flex items-center justify-center text-xs text-ink-4">{emptyLabel}</div>
      )}
    </div>
  );
}

interface LpOgpCardProps {
  preview: LpPreview | null;
  url: string;
  /** Shown when the page has neither OGP nor <title> (Squad beyond versions): the article title. */
  fallbackTitle?: string | null;
}

/** Link card with the page title, description and host (OGP when present, <title> otherwise). */
export function LpOgpCard({ preview, url, fallbackTitle }: LpOgpCardProps) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep raw */
  }
  const image = preview?.ogImage ?? null;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="flex border border-line bg-white hover:border-ink transition-colors min-w-0">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- external OGP image
        <img src={image} alt="" className="w-28 h-20 object-cover shrink-0 border-r border-line" referrerPolicy="no-referrer" />
      ) : null}
      <span className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-0">
        <span className="text-sm font-bold truncate">{preview?.title || fallbackTitle || preview?.siteName || host}</span>
        {preview?.description ? <span className="text-xs text-ink-3 line-clamp-2">{preview.description}</span> : null}
        <span className="text-[11px] text-ink-4 truncate">{preview?.siteName ? `${preview.siteName}・` : ""}{host}</span>
      </span>
    </a>
  );
}
