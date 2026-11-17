import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  /** Short label shown next to the checkbox. */
  title: string;
  /** Optional subtitle under the title when expanded. */
  description?: string;
  /** Start collapsed (default true — keeps pages uncluttered). */
  defaultCollapsed?: boolean;
  /** Extra classes on the outer Card. */
  className?: string;
  /** Optional icon element rendered left of the title. */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Card that starts collapsed. Check the box to expand and show children.
 * Used across quotation builders to avoid overcrowding the page.
 */
export function CollapsibleCard({
  title,
  description,
  defaultCollapsed = true,
  className,
  icon,
  children,
}: Props) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <Card className={cn("mb-4 p-4", className)}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-forest"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
          aria-expanded={open}
        />
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
      </label>
      {open ? <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">{children}</div> : null}
    </Card>
  );
}
