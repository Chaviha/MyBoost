import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full appearance-none rounded-md bg-canvas bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm text-ink shadow-border",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%236f675c%22 stroke-width=%222%22><path d=%22M2 4l4 4 4-4%22/></svg>')]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/35",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
