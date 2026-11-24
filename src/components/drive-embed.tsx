"use client";
// Google Drive player / thumbnail for creatives registered by Drive URL.
import { useState } from "react";
import { driveFileId, drivePreviewUrl, driveThumbnailUrl } from "@/lib/domain/drive";

interface DriveEmbedProps {
  url: string;
  className?: string;
}

/** Drive's own player. It plays for anyone whose Google account can open the file. */
export function DriveEmbed({ url, className = "" }: DriveEmbedProps) {
  const id = driveFileId(url);
  if (!id) return null;
  return (
    <iframe
      src={drivePreviewUrl(id)}
      title="Googleドライブの動画"
      allow="autoplay; fullscreen"
      allowFullScreen
      referrerPolicy="no-referrer"
      className={`border-0 bg-black ${className}`}
    />
  );
}

interface DriveThumbProps {
  url: string | null;
  className?: string;
}

/** Drive poster image; renders nothing when the file is not viewable (private, or third-party cookies blocked). */
export function DriveThumb({ url, className = "" }: DriveThumbProps) {
  const [failed, setFailed] = useState(false);
  const id = driveFileId(url);
  if (!id || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Drive thumbnail
    <img src={driveThumbnailUrl(id)} alt="" className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
