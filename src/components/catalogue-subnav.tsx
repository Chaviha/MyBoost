import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  BriefcaseBusiness,
  Layers,
  ListTree,
  Package,
  Store,
<<<<<<< HEAD
=======
  Calculator,
>>>>>>> 96672fa (Add quotation workflow and Cloudflare R2 storage)
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";

<<<<<<< HEAD
const PRIMARY = [
  { to: "/catalogue", label: "Overview", icon: Store },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/products", label: "Items · Product", icon: Boxes },
  { to: "/services", label: "Items · Service", icon: BriefcaseBusiness },
] as const;

const PRODUCT_SETUP = [
  { to: "/specifications", label: "Specifications", icon: ListTree },
  { to: "/variants", label: "Options", icon: Layers, optional: true as const },
  { to: "/inventory", label: "Stock", icon: Package, optional: true as const },
] as const;

const SERVICE_SETUP = [
  { to: "/specifications", label: "Specifications", icon: ListTree },
=======
const TABS = [
  { to: "/catalogue", label: "Overview", icon: Store },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/products", label: "Products", icon: Boxes },
  { to: "/services", label: "Services", icon: BriefcaseBusiness },
  { to: "/pricing", label: "Pricing", icon: Calculator },
  { to: "/specifications", label: "Specs", icon: ListTree },
  { to: "/variants", label: "Options", icon: Layers },
  { to: "/inventory", label: "Stock", icon: Package },
>>>>>>> 96672fa (Add quotation workflow and Cloudflare R2 storage)
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/catalogue") return pathname === "/catalogue";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function CatalogueSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
<<<<<<< HEAD
  const onService = pathname.startsWith("/services");
  const setup = onService ? SERVICE_SETUP : PRODUCT_SETUP;

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1.5">
        {PRIMARY.map((item) => {
=======

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1.5">
        {TABS.map((item) => {
>>>>>>> 96672fa (Add quotation workflow and Cloudflare R2 storage)
          const active = isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
<<<<<<< HEAD
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
=======
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition",
>>>>>>> 96672fa (Add quotation workflow and Cloudflare R2 storage)
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
<<<<<<< HEAD

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <span className="mr-1 font-medium text-ink-soft">
          {onService ? "Service" : "Product"} structure:
        </span>
        {setup.map((item, i) => {
          const active = isActive(pathname, item.to);
          return (
            <span key={item.to} className="inline-flex items-center gap-1">
              {i > 0 ? <span className="text-ink-faint px-0.5">/</span> : null}
              <Link
                to={item.to}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 transition",
                  active ? "bg-leaf font-medium text-forest" : "hover:bg-canvas hover:text-ink",
                )}
              >
                <item.icon className="size-3" />
                {item.label}
                {"optional" in item && item.optional ? (
                  <span className="text-[10px] opacity-70">(optional)</span>
                ) : null}
              </Link>
            </span>
          );
        })}
        <span className="text-ink-faint px-1">·</span>
        <span className="text-[11px]">Pricing is set on each item</span>
      </div>
=======
>>>>>>> 96672fa (Add quotation workflow and Cloudflare R2 storage)
    </div>
  );
}
