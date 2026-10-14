import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  text,
  compact,
}: {
  icon: LucideIcon;
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center text-ink-muted",
        compact ? "py-8" : "rounded-xl bg-paper px-6 py-16 shadow-border border border-line/60",
      )}
    >
      <div className={cn("rounded-full bg-leaf/80 p-3 text-forest", compact && "p-2")}>
        <Icon className={compact ? "size-4" : "size-6"} />
      </div>
      <p className="max-w-sm text-sm text-pretty mt-1">{text}</p>
    </div>
  );
}
