import { useRef, useState } from "react";
import { Car, Landmark, Package, Tractor } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICON = {
  Property: Landmark,
  Vehicle: Car,
  Land: Landmark,
  Equipment: Package,
  Investment: Package,
  Farm: Tractor,
  Other: Package,
  Retail: Landmark,
  Restaurant: Package,
} as const;

/** Shared listing cover. A supplied gallery video previews silently while hovered. */
export function ListingCover({
  src,
  videoSrc,
  alt,
  type,
  className,
}: {
  src?: string;
  videoSrc?: string;
  alt: string;
  type?: string;
  className?: string;
}) {
  const Icon = TYPE_ICON[(type as keyof typeof TYPE_ICON) || "Other"] ?? Package;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  async function startPreview() {
    const video = videoRef.current;
    if (!video || !videoSrc || videoFailed) return;
    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      // Autoplay may be blocked by browser settings; the cover image remains visible.
    }
  }

  function stopPreview() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    try { video.currentTime = 0; } catch { /* ignore media not ready */ }
  }

  return (
    <div
      className={cn("group relative isolate overflow-hidden bg-leaf", className)}
      onMouseEnter={() => void startPreview()}
      onMouseLeave={stopPreview}
      onFocus={() => void startPreview()}
      onBlur={stopPreview}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cn("h-full w-full object-cover", videoSrc && !videoFailed ? "transition-opacity duration-200 group-hover:opacity-0" : "")}
        />
      ) : !videoSrc || videoFailed ? (
        <div className="flex h-full min-h-36 w-full items-center justify-center text-forest">
          <Icon className="size-10" />
        </div>
      ) : null}
      {videoSrc && !videoFailed ? (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          playsInline
          loop
          preload="none"
          aria-label={`${alt} video preview`}
          onError={() => setVideoFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />
      ) : null}
      {src && videoSrc && !videoFailed ? (
        <div className="pointer-events-none absolute inset-0 bg-transparent" />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-ink/8" />
    </div>
  );
}
