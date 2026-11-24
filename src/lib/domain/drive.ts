// Google Drive links for creatives registered by URL (the sheet's "クリエイティブURL").

const ID = /^[A-Za-z0-9_-]{10,}$/;
const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com", "drive.usercontent.google.com"]);

/** File id from the usual Drive share URLs (/file/d/{id}/view, open?id=, uc?id=); null otherwise. */
export function driveFileId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const fromPath = /\/(?:file\/)?d\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  const id = fromPath ?? url.searchParams.get("id");
  return id && ID.test(id) ? id : null;
}

/** Embeddable player. Works for files the viewer can open with their own Google account. */
export const drivePreviewUrl = (id: string): string => `https://drive.google.com/file/d/${id}/preview`;

/** Small poster image (same access rule as the player). */
export const driveThumbnailUrl = (id: string, width = 640): string => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;

/** Direct download used by the server proxy for video analysis. Only files shared "anyone with the link" succeed. */
export const driveDownloadUrl = (id: string): string => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
