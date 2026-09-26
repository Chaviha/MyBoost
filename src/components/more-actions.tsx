import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

type Action = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
};

export function MoreActions({ actions, label = "More actions" }: { actions: Action[]; label?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-paper text-ink-muted transition hover:bg-canvas hover:text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-xl border border-line bg-paper p-1.5 shadow-lg"
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onSelect}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none",
                "focus:bg-canvas data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                action.destructive
                  ? "text-red-600 focus:text-red-700"
                  : "text-ink focus:text-ink",
              )}
            >
              {action.icon}
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
