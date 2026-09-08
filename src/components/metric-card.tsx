import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "red";
}) {
  return (
    <Card className="flex min-h-[7.5rem] flex-col justify-between p-4">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-md",
          tone === "red" ? "bg-danger-bg text-clay" : "bg-leaf text-forest",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-xs text-ink-muted">{title}</p>
        <p className="mt-0.5 font-display text-xl font-medium tracking-tight tabular-nums">
          {value}
        </p>
      </div>
    </Card>
  );
}
