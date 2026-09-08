import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Circular avatar: renders the image cropped to a perfect circle, or falls back to initials. */
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = size === "sm" ? "size-9 text-xs" : size === "lg" ? "size-20 text-xl" : "size-10 text-xs";
  return (
    <div
      className={cn(
        "relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-leaf font-medium text-forest",
        sizeClass,
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
