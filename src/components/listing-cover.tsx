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

export function ListingCover({
  src,
  alt,
  type,
  className,
}: {
  src?: string;
  alt: string;
  type?: string;
  className?: string;
}) {
  const Icon = TYPE_ICON[(type as keyof typeof TYPE_ICON) || "Other"] ?? Package;
  return (
    <div className={cn("relative isolate overflow-hidden bg-leaf", className)}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full min-h-36 w-full items-center justify-center text-forest">
          <Icon className="size-10" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-ink/8" />
    </div>
  );
}
