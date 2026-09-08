import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-canvas text-ink-muted",
  forest: "bg-leaf text-forest",
  amber: "bg-amber-bg text-amber",
  red: "bg-danger-bg text-clay",
} as const;

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
