import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-32 w-full rounded-lg bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink shadow-border",
      "placeholder:text-ink-faint",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/35",
      "disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
