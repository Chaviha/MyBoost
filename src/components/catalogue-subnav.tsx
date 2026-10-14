import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  BriefcaseBusiness,
  Layers,
  ListTree,
  Package,
  Store,
  Calculator,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/catalogue", label: "Overview", icon: Store },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/products", label: "Products", icon: Boxes },
  { to: "/services", label: "Services", icon: BriefcaseBusiness },
  { to: "/pricing", label: "Pricing", icon: Calculator },
  { to: "/specifications", label: "Specs", icon: ListTree },
  { to: "/variants", label: "Options", icon: Layers },
  { to: "/inventory", label: "Stock", icon: Package },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/catalogue") return pathname === "/catalogue";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function CatalogueSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1.5">
        {TABS.map((item) => {
          const active = isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-leaf text-forest"
                  : "text-ink-muted hover:bg-canvas hover:text-ink",
              )}
            >
              <item.icon className="size-3.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
