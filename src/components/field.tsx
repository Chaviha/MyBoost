import { type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("mb-3 block", className)}>
      <Label className="mb-1.5 flex items-center gap-1.5">
        {label}
        {hint ? <span className="font-normal text-ink-faint">{hint}</span> : null}
      </Label>
      {children}
    </label>
  );
}
