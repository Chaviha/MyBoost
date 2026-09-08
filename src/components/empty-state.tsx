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
        compact ? "py-8" : "rounded-xl bg-paper px-6 py-16 shadow-border",
      )}
    >
      <Icon className={compact ? "size-5" : "size-7"} />
      <p className="max-w-sm text-sm text-pretty">{text}</p>
    </div>
  );
}
